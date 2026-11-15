import { NextResponse } from "next/server";
import { authed, parseBody } from "@/lib/http";
import { conflict, forbidden } from "@/lib/auth";
import { completeTaskSchema } from "@/lib/validation";
import { notify } from "@/lib/notify";
import { applyTransition, openSubtasks, stopTimer, taskCtx, validateReviewer, workOwnerId } from "@/lib/task-flow";

/**
 * Mark the work done. Only the person responsible (assignee) can do this — never the creator on their behalf.
 * Pass reviewerId to send it straight to review; otherwise it stays COMPLETED until it is ended or sent to review.
 */
export const POST = authed<{ id: string }>(async (req, actor, { id }) => {
  const ctx = await taskCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const { task, access } = ctx;
  if (workOwnerId(task) !== actor.id) return forbidden();
  if (!["TODO", "IN_PROGRESS", "PAUSED"].includes(task.status)) return conflict(`Cannot complete a task that is ${task.status}`);

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
  const updated = await applyTransition(
    task.id,
    {
      status: reviewerId ? "IN_REVIEW" : "COMPLETED",
      completedAt: now,
      reviewerId: reviewerId ?? null,
      ...stopTimer(task, now),
    },
    [
      { type: "COMPLETED", actorId: actor.id, note },
      ...(reviewerId ? [{ type: "REVIEW_REQUESTED" as const, actorId: actor.id, note: `Reviewer: user ${reviewerId}` }] : []),
    ],
  );
  if (reviewerId) {
    await notify({ userId: reviewerId, type: "TASK_REVIEW_REQUESTED", title: `Review requested: ${task.title}`, body: `${actor.name} sent this task for your review.${note ? ` “${note}”` : ""}`, taskId: task.id });
  } else if (task.createdById !== actor.id) {
    await notify({ userId: task.createdById, type: "TASK_COMPLETED", title: `Task completed: ${task.title}`, body: `${actor.name} marked this task complete.`, taskId: task.id });
  }
  return NextResponse.json({ task: updated });
});
