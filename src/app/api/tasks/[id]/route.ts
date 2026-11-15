import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody } from "@/lib/http";
import { badRequest, conflict, forbidden } from "@/lib/auth";
import { updateTaskSchema } from "@/lib/validation";
import { outranks, rank } from "@/lib/roles";
import { notify } from "@/lib/notify";
import { applyTransition, taskCtx, taskInclude, withLiveTime } from "@/lib/task-flow";

type P = { id: string };

export const GET = authed<P>(async (_req, actor, { id }) => {
  const ctx = await taskCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: ctx.task.id },
    include: {
      ...taskInclude,
      project: { select: { id: true, name: true } },
      subtasks: { include: taskInclude, orderBy: { createdAt: "asc" } },
      events: { include: { actor: { select: { id: true, name: true } } }, orderBy: { id: "asc" } },
    },
  });
  return NextResponse.json({ task: { ...withLiveTime(task), subtasks: task.subtasks.map(withLiveTime) } });
});

/** Edit details. Allowed for the creator and project managers; anyone may self-assign an unassigned task. */
export const PATCH = authed<P>(async (req, actor, { id }) => {
  const ctx = await taskCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const { task, access } = ctx;
  if (task.status === "ENDED") return conflict("Ended tasks cannot be edited");

  const body = await parseBody(req, updateTaskSchema);
  if ("error" in body) return body.error;
  const { assigneeId, dueDate, ...fields } = body.data;

  const isEditor = task.createdById === actor.id || access.canManage;
  const onlySelfClaim =
    task.assigneeId === null && assigneeId === actor.id && Object.keys(fields).length === 0 && dueDate === undefined;
  if (!isEditor && !onlySelfClaim) return forbidden();

  const data: Record<string, unknown> = { ...fields };
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;

  let assigned = false;
  if (assigneeId !== undefined && assigneeId !== task.assigneeId) {
    if (task.status !== "TODO") return conflict("Only tasks in TODO can be reassigned");
    if (assigneeId !== null && assigneeId !== actor.id) {
      if (!access.memberIds.includes(assigneeId)) return badRequest("Assignee must be a project member");
      const a = await prisma.user.findUnique({ where: { id: assigneeId }, select: { role: true } });
      if (!a) return badRequest("Assignee not found");
      if (!access.canManage && !(rank(actor.role) >= rank("LEAD") && outranks(actor.role, a.role))) return forbidden();
    }
    data.assigneeId = assigneeId;
    assigned = true;
  }

  const updated = await applyTransition(
    task.id,
    data,
    assigned ? [{ type: "ASSIGNED", actorId: actor.id, note: assigneeId ? `Assigned to user ${assigneeId}` : "Unassigned" }] : [],
  );
  if (assigned && assigneeId && assigneeId !== actor.id) {
    await notify({ userId: assigneeId, type: "TASK_ASSIGNED", title: `Task assigned: ${task.title}`, body: `${actor.name} assigned you this task.`, taskId: task.id });
  }
  return NextResponse.json({ task: updated });
});

/** Delete (with its sub-tasks): creator while still TODO, or a project manager. */
export const DELETE = authed<P>(async (_req, actor, { id }) => {
  const ctx = await taskCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const { task, access } = ctx;
  if (!access.canManage && !(task.createdById === actor.id && task.status === "TODO")) return forbidden();
  await prisma.task.delete({ where: { id: task.id } });
  return NextResponse.json({ ok: true });
});
