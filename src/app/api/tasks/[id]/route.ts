import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody } from "@/lib/http";
import { conflict, forbidden } from "@/lib/auth";
import { updateTaskSchema } from "@/lib/validation";
import { notify } from "@/lib/notify";
import { validateAssignees } from "@/lib/assign";
import { enforceShiftEnd } from "@/lib/day-timer";
import { activeOf, applyTransition, taskCtx, taskInclude, withLiveTime } from "@/lib/task-flow";

type P = { id: string };

export const GET = authed<P>(async (_req, actor, { id }) => {
  const ctx = await taskCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  await Promise.all(ctx.task.assignees.map((a) => enforceShiftEnd(a.userId))); // timers of people past their shift end
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: ctx.task.id },
    include: {
      ...taskInclude,
      project: { select: { id: true, name: true } },
      parent: { select: { id: true, title: true, status: true } },
      subtasks: { include: taskInclude, orderBy: { createdAt: "asc" } },
      comments: { include: { author: { select: { id: true, name: true } } }, orderBy: { id: "asc" } },
      events: { include: { actor: { select: { id: true, name: true } } }, orderBy: { id: "asc" } },
    },
  });
  return NextResponse.json({ task: { ...withLiveTime(task, actor.id), subtasks: task.subtasks.map((s) => withLiveTime(s, actor.id)) } });
});

/**
 * Edit details / assignees. Details and removals: creator and project managers.
 * Anyone in the project may add anyone else to the task.
 */
export const PATCH = authed<P>(async (req, actor, { id }) => {
  const ctx = await taskCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const { task, access } = ctx;
  if (task.status === "ENDED") return conflict("Ended tasks cannot be edited");

  const body = await parseBody(req, updateTaskSchema);
  if ("error" in body) return body.error;
  const { assigneeIds: rawIds, assigneeId, dueDate, ...fields } = body.data;
  const wanted = rawIds ?? (assigneeId === undefined ? undefined : assigneeId === null ? [] : [assigneeId]);
  const next = wanted ? [...new Set(wanted)] : undefined;

  const current = activeOf(task);
  const isEditor = task.createdById === actor.id || access.canManage;
  // Any project member may add people to a task (but not remove anyone or edit details).
  const onlyAdd = !!next && current.every((a) => next.includes(a.userId)) && Object.keys(fields).length === 0 && dueDate === undefined;
  if (!isEditor && !onlyAdd) return forbidden();

  const data: Record<string, unknown> = { ...fields };
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;

  const ops = [];
  let note: string | null = null;
  let added: number[] = [];
  if (next) {
    if (["COMPLETED", "IN_REVIEW"].includes(task.status)) return conflict("Assignees cannot change while the task is completed or in review");
    const currentIds = current.map((a) => a.userId);
    added = next.filter((u) => !currentIds.includes(u));
    const removed = current.filter((a) => !next.includes(a.userId));
    const locked = removed.find((a) => a.startedAt || a.workedSeconds > 0 || a.lastResumedAt || a.doneAt);
    if (locked) return conflict("Someone who has already worked on this task cannot be removed");
    const bad = await validateAssignees(added, actor, access);
    if (bad) return bad;

    for (const a of removed) ops.push(prisma.taskAssignee.delete({ where: { id: a.id } }));
    for (const userId of added) {
      ops.push(prisma.taskAssignee.upsert({
        where: { taskId_userId: { taskId: task.id, userId } },
        create: { taskId: task.id, userId },
        update: { status: "ASSIGNED", rejectReason: null, rejectedAt: null, doneAt: null },
      }));
    }
    const kept = currentIds.filter((u) => next.includes(u));
    data.assigneeId = [...kept, ...added][0] ?? null;
    if (added.length || removed.length) note = `Assignees updated (+${added.length} / −${removed.length})`;
  }

  const updated = await applyTransition(task.id, data, note ? [{ type: "ASSIGNED", actorId: actor.id, note }] : [], actor.id, ops);
  for (const userId of added.filter((u) => u !== actor.id)) {
    await notify({ userId, type: "TASK_ASSIGNED", title: `Task assigned: ${task.title}`, body: `${actor.name} added you to this task.`, taskId: task.id });
  }
  return NextResponse.json({ task: updated });
});

/** Delete (with its sub-tasks): creator while nobody has started, or a project manager. */
export const DELETE = authed<P>(async (_req, actor, { id }) => {
  const ctx = await taskCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const { task, access } = ctx;
  if (!access.canManage && !(task.createdById === actor.id && task.status === "TODO")) return forbidden();

  // the task and every nested sub-task (deleted with it by the cascade)
  const ids = [task.id];
  for (let level = [task.id]; level.length; ) {
    level = (await prisma.task.findMany({ where: { parentId: { in: level } }, select: { id: true } })).map((t) => t.id);
    ids.push(...level);
  }
  const running = await prisma.taskAssignee.count({ where: { taskId: { in: ids }, lastResumedAt: { not: null } } });
  if (running) return conflict("Someone is working on this task (or a sub-task) right now — their timer must be paused first");

  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { taskId: { in: ids } } }),
    prisma.task.delete({ where: { id: task.id } }),
  ]);
  return NextResponse.json({ ok: true, deleted: ids.length });
});
