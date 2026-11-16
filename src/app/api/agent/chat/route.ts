import { NextResponse } from "next/server";
import { z } from "zod";
import { authed, parseBody } from "@/lib/http";
import { groqChat, groqConfigured, type Msg, type ToolDef } from "@/lib/agent/groq";
import { callApi, apiError } from "@/lib/agent/internal";
import { planSchema } from "@/lib/agent/plan";

const schema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(30),
});

const fn = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []): ToolDef => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required } },
});
const idProp = { type: "integer" };
const taskProps = {
  title: { type: "string" },
  description: { type: "string", description: "What done looks like; plain text" },
  priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
  dueDate: { type: "string", description: "YYYY-MM-DD" },
  estimatedMinutes: { type: "integer" },
  assigneeIds: { type: "array", items: idProp, description: "Must be members of the project" },
};

const TOOLS: ToolDef[] = [
  fn("list_projects", "Projects the user can see (id, name, status)."),
  fn("get_project", "Project members (ids, names, roles) and its tasks with assignees, status and due dates.", { projectId: idProp }, ["projectId"]),
  fn("list_people", "Active people in the company directory (id, name, role, designation). Optional name filter.", { q: { type: "string" } }),
  fn("list_my_tasks", "The user's own assigned tasks across projects."),
  fn("propose_plan", "FINAL STEP. Submit the concrete plan for the user to approve. Nothing is executed until they approve it.", {
    summary: { type: "string", description: "Short explanation of the plan and why work is split/assigned this way" },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["create_task", "assign_task", "add_comment", "start_task"] },
          projectId: idProp, taskId: idProp, ...taskProps,
          subtasks: { type: "array", items: { type: "object", properties: taskProps, required: ["title"] }, description: "create_task only: ordered sub-tasks" },
          addAssigneeIds: { type: "array", items: idProp, description: "assign_task only" },
          text: { type: "string", description: "add_comment only" },
        },
        required: ["type"],
      },
    },
  }, ["summary", "actions"]),
];

const slim = (t: any) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate?.slice?.(0, 10) ?? null, parentId: t.parentId, assignees: (t.assignees ?? []).filter((a: any) => a.status === "ASSIGNED").map((a: any) => a.user?.name ?? a.userId) });

export const POST = authed(async (req, actor) => {
  if (!groqConfigured()) return NextResponse.json({ error: "The assistant isn't configured. Set GROQ_API_KEY on the server." }, { status: 503 });
  const body = await parseBody(req, schema);
  if ("error" in body) return body.error;

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const messages: Msg[] = [
    {
      role: "system",
      content: `You are PAL's task-planning agent for ${actor.name} (user id ${actor.id}, role ${actor.role}). Today is ${today} (IST).
Turn the user's goal into a concrete, executable plan: break it into well-titled tasks and sub-tasks with clear descriptions, priorities, realistic estimates and due dates, and assign each to the best-suited people.
Rules:
- ALWAYS look things up with tools before planning. Never invent ids: project ids, user ids and task ids must come from tool results.
- Assignees of a task must be members of that task's project (see get_project). Prefer people with lighter open workload.
- If the project, the goal or who should do it is genuinely ambiguous, ask ONE short clarifying question in plain text instead of guessing.
- When ready, call propose_plan exactly once. Do not claim anything has been created: execution only happens after the user approves.
- Keep titles short and action-oriented. Be concise.`,
    },
    ...body.data.messages,
  ];

  const trace: string[] = [];
  for (let step = 0; step < 8; step++) {
    let reply;
    try { reply = await groqChat(messages, TOOLS); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "AI request failed" }, { status: 502 }); }

    if (!reply.tool_calls?.length) return NextResponse.json({ reply: reply.content ?? "", trace });
    messages.push({ role: "assistant", content: reply.content, tool_calls: reply.tool_calls });

    for (const call of reply.tool_calls) {
      let args: any = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* handled below */ }
      let out: unknown;

      if (call.function.name === "propose_plan") {
        const parsed = planSchema.safeParse(args);
        if (parsed.success) return NextResponse.json({ reply: parsed.data.summary, plan: parsed.data, trace });
        out = { error: "Invalid plan", details: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) };
      } else if (call.function.name === "list_projects") {
        const r = await callApi(req, "GET", "/api/projects");
        out = r.ok ? r.data.projects.map((p: any) => ({ id: p.id, name: p.name, status: p.status })) : { error: apiError(r.data, r.status) };
        trace.push("Looked at your projects");
      } else if (call.function.name === "get_project" && Number.isInteger(args.projectId)) {
        const [p, t] = await Promise.all([callApi(req, "GET", `/api/projects/${args.projectId}`), callApi(req, "GET", `/api/projects/${args.projectId}/tasks`)]);
        out = p.ok && t.ok
          ? { name: p.data.project.name, members: p.data.project.members.map((m: any) => ({ id: m.user.id, name: m.user.name, role: m.user.role, designation: m.user.designation })), tasks: t.data.tasks.map(slim).slice(0, 60) }
          : { error: apiError((p.ok ? t : p).data, (p.ok ? t : p).status) };
        trace.push(`Reviewed project ${p.ok ? p.data.project.name : "#" + args.projectId}`);
      } else if (call.function.name === "list_people") {
        const r = await callApi(req, "GET", `/api/directory${args.q ? `?q=${encodeURIComponent(args.q)}` : ""}`);
        out = r.ok ? [{ id: actor.id, name: actor.name, role: actor.role, note: "the user" }, ...r.data.users] : { error: apiError(r.data, r.status) };
        trace.push("Checked the team directory");
      } else if (call.function.name === "list_my_tasks") {
        const r = await callApi(req, "GET", "/api/tasks/me");
        out = r.ok ? r.data.tasks.map((t: any) => ({ ...slim(t), project: t.project.name })).slice(0, 60) : { error: apiError(r.data, r.status) };
        trace.push("Checked your tasks");
      } else out = { error: "Unknown tool or bad arguments" };

      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out).slice(0, 12_000) });
    }
  }
  return NextResponse.json({ reply: "I couldn't finish planning that — try a more specific request.", trace });
});
