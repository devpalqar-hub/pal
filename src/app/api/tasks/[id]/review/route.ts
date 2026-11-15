import { NextResponse } from "next/server";
import { authed, parseBody } from "@/lib/http";
import { conflict, forbidden } from "@/lib/auth";
import { reviewTaskSchema } from "@/lib/validation";
import { notify } from "@/lib/notify";
import { applyTransition, taskCtx } from "@/lib/task-flow";

/** Reviewer decision. APPROVE ends the task; REJECT sends it back to the assignee (PAUSED) with a note. */
export const POST = authed<{ id: string }>(async (req, actor, { id }) => {
  const ctx = await taskCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const { task, access } = ctx;
  if (task.status !== "IN_REVIEW") return conflict(`Task is not in review (status is ${task.status})`);
  if (task.reviewerId !== actor.id && !access.canManage) return forbidden();

  const body = await parseBody(req, reviewTaskSchema);
  if ("error" in body) return body.error;
  const { decision, note } = body.data;

  const updated =
    decision === "APPROVE"
      ? await applyTransition(task.id, { status: "ENDED", endedAt: new Date() }, [
          { type: "APPROVED", actorId: actor.id, note },
          { type: "ENDED", actorId: actor.id },
        ])
      : await applyTransition(task.id, { status: "PAUSED", completedAt: null, reviewerId: null }, [
          { type: "REJECTED", actorId: actor.id, note },
        ]);
  if (task.assigneeId && task.assigneeId !== actor.id) {
    await notify(decision === "APPROVE"
      ? { userId: task.assigneeId, type: "TASK_APPROVED", title: `Approved: ${task.title}`, body: `${actor.name} approved your work.${note ? ` “${note}”` : ""}`, taskId: task.id }
      : { userId: task.assigneeId, type: "TASK_REJECTED", title: `Changes requested: ${task.title}`, body: `${actor.name}: “${note}”`, taskId: task.id });
  }
  return NextResponse.json({ task: updated });
});
