import { NextResponse } from "next/server";
import { z } from "zod";
import { authed, parseBody } from "@/lib/http";
import { callApi, apiError } from "@/lib/agent/internal";
import { actionSchema, type Action } from "@/lib/agent/plan";

const schema = z.object({ actions: z.array(actionSchema).min(1).max(25) });
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const html = (s?: string) => (s ? s.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("") : undefined);

type Result = { ok: boolean; label: string; error?: string; taskId?: number };

/** Runs an approved plan step by step through PAL's own API as the signed-in user (all permission checks apply). */
export const POST = authed(async (req, _actor) => {
  const body = await parseBody(req, schema);
  if ("error" in body) return body.error;
  const results: Result[] = [];

  async function make(projectId: number, t: { title: string; description?: string; priority?: string; dueDate?: string; estimatedMinutes?: number; assigneeIds?: number[] }, parentId?: number): Promise<Result> {
    const r = await callApi(req, "POST", `/api/projects/${projectId}/tasks`, {
      title: t.title, description: html(t.description), priority: t.priority, dueDate: t.dueDate, estimatedMinutes: t.estimatedMinutes, assigneeIds: t.assigneeIds, parentId,
    });
    return r.ok ? { ok: true, label: `${parentId ? "Sub-task" : "Task"} created: ${t.title}`, taskId: r.data.task.id } : { ok: false, label: `${parentId ? "Sub-task" : "Task"}: ${t.title}`, error: apiError(r.data, r.status) };
  }

  async function run(a: Action): Promise<void> {
    if (a.type === "create_task") {
      const main = await make(a.projectId, a);
      results.push(main);
      if (!main.ok) { for (const s of a.subtasks ?? []) results.push({ ok: false, label: `Sub-task: ${s.title}`, error: "Skipped — parent task failed" }); return; }
      for (const s of a.subtasks ?? []) results.push(await make(a.projectId, s, main.taskId));
    } else if (a.type === "assign_task") {
      const cur = await callApi(req, "GET", `/api/tasks/${a.taskId}`);
      if (!cur.ok) return void results.push({ ok: false, label: `Assign on task #${a.taskId}`, error: apiError(cur.data, cur.status) });
      const existing = (cur.data.task.assignees ?? []).filter((x: any) => x.status === "ASSIGNED").map((x: any) => x.userId);
      const r = await callApi(req, "PATCH", `/api/tasks/${a.taskId}`, { assigneeIds: [...new Set([...existing, ...a.addAssigneeIds])] });
      results.push(r.ok ? { ok: true, label: `Assigned people to “${cur.data.task.title}”`, taskId: a.taskId } : { ok: false, label: `Assign on “${cur.data.task.title}”`, error: apiError(r.data, r.status) });
    } else if (a.type === "add_comment") {
      const r = await callApi(req, "POST", `/api/tasks/${a.taskId}/comments`, { body: a.text });
      results.push(r.ok ? { ok: true, label: `Commented on task #${a.taskId}`, taskId: a.taskId } : { ok: false, label: `Comment on task #${a.taskId}`, error: apiError(r.data, r.status) });
    } else {
      const r = await callApi(req, "POST", `/api/tasks/${a.taskId}/start`);
      results.push(r.ok ? { ok: true, label: `Started your timer on task #${a.taskId}`, taskId: a.taskId } : { ok: false, label: `Start task #${a.taskId}`, error: apiError(r.data, r.status) });
    }
  }

  for (const a of body.data.actions) await run(a);
  return NextResponse.json({ results });
});
