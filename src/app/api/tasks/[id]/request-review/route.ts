import { NextResponse } from "next/server";
import { authed, parseBody } from "@/lib/http";
import { conflict, forbidden } from "@/lib/auth";
import { requestReviewSchema } from "@/lib/validation";
import { notify } from "@/lib/notify";
import { applyTransition, isWorkOwner, taskCtx, validateReviewer } from "@/lib/task-flow";

/** Send a COMPLETED task to a person for review. */
export const POST = authed<{ id: string }>(async (req, actor, { id }) => {
  const ctx = await taskCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const { task, access } = ctx;
  if (!isWorkOwner(task, actor.id)) return forbidden();
  if (task.status !== "COMPLETED") return conflict(`Only COMPLETED tasks can be sent to review (status is ${task.status})`);

  const body = await parseBody(req, requestReviewSchema);
  if ("error" in body) return body.error;
  const err = await validateReviewer(body.data.reviewerId, task, access);
  if (err) return err;

  const updated = await applyTransition(task.id, { status: "IN_REVIEW", reviewerId: body.data.reviewerId }, [
    { type: "REVIEW_REQUESTED", actorId: actor.id, note: body.data.note ?? `Reviewer: user ${body.data.reviewerId}` },
  ], actor.id);
  await notify({ userId: body.data.reviewerId, type: "TASK_REVIEW_REQUESTED", title: `Review requested: ${task.title}`, body: `${actor.name} sent this task for your review.${body.data.note ? ` “${body.data.note}”` : ""}`, taskId: task.id });
  return NextResponse.json({ task: updated });
});
