import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody } from "@/lib/http";
import { conflict, forbidden } from "@/lib/auth";
import { completeTaskSchema } from "@/lib/validation";
import { notify } from "@/lib/notify";
import { activeOf, applyTransition, elapsedSeconds, isWorkOwner, mineOf, openSubtasks, taskCtx, validateReviewer, workingStatus } from "@/lib/task-flow";

/**
 * Finish YOUR part. Only an assignee can do this (never the creator on their behalf).
 * The task becomes COMPLETED (or IN_REVIEW when reviewerId is given) once every assignee has finished.
 */
export const POST = authed<{ id: string }>(async (req, actor, { id }) => {
  const ctx = await taskCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const { task, access } = ctx;
  if (!isWorkOwner(task, actor.id)) return forbidden();
  if (!["TODO", "IN_PROGRESS", "PAUSED"].includes(task.status)) return conflict(`Cannot complete a task that is ${task.status}`);
  const mine = mineOf(task, actor.id);
  if (mine?.doneAt) return conflict("You have already finished your part of this task");

  const open = openSubtasks(task);
  if (open) return conflict("Finish all sub-tasks first", { openSubtasks: open });

  const body = await parseBody(req, completeTaskSchema);
  if ("error" in body) return body.error;
  const { reviewerId, note } = body.data;
  if (reviewerId) {
    const err = await validateReviewer(reviewerId, task, access);
    if (err) return err;
  }

  const now = new Date();
  const others = activeOf(task).filter((a) => a.userId !== actor.id);
  const allDone = others.every((a) => a.doneAt);
  const add = mine ? elapsedSeconds(mine, now) : 0;
  const ops = mine
    ? [prisma.taskAssignee.update({ where: { id: mine.id }, data: { doneAt: now, lastResumedAt: null, workedSeconds: { increment: add } } })]
    : [];

  const updated = await applyTransition(
    task.id,
    allDone
      ? { status: reviewerId ? "IN_REVIEW" : "COMPLETED", completedAt: now, reviewerId: reviewerId ?? null, workedSeconds: { increment: add } }
      : { status: workingStatus(others, !!task.startedAt), workedSeconds: { increment: add } },
    [
      { type: "COMPLETED", actorId: actor.id, note: allDone ? note : `${note ? note + " — " : ""}finished their part` },
      ...(allDone && reviewerId ? [{ type: "REVIEW_REQUESTED" as const, actorId: actor.id, note: `Reviewer: user ${reviewerId}` }] : []),
    ],
    actor.id,
    ops,
  );

  if (allDone && reviewerId) {
    await notify({ userId: reviewerId, type: "TASK_REVIEW_REQUESTED", title: `Review requested: ${task.title}`, body: `${actor.name} sent this task for your review.${note ? ` “${note}”` : ""}`, taskId: task.id });
  } else if (task.createdById !== actor.id) {
    await notify({ userId: task.createdById, type: "TASK_COMPLETED", title: allDone ? `Task completed: ${task.title}` : `Progress: ${task.title}`, body: allDone ? `${actor.name} marked this task complete.` : `${actor.name} finished their part (${others.filter((a) => !a.doneAt).length} still working).`, taskId: task.id });
  }
  return NextResponse.json({ task: updated, taskCompleted: allDone });
});

