import { NextResponse } from "next/server";
import { authed } from "@/lib/http";
import { conflict, forbidden } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { activeOf, applyTransition, taskCtx } from "@/lib/task-flow";

/** Close a COMPLETED task without review (task creator or project manager). */
export const POST = authed<{ id: string }>(async (_req, actor, { id }) => {
  const ctx = await taskCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const { task, access } = ctx;
  if (task.status !== "COMPLETED") return conflict(`Only COMPLETED tasks can be ended (status is ${task.status})`);
  if (task.createdById !== actor.id && !access.canManage) return forbidden();

  const updated = await applyTransition(task.id, { status: "ENDED", endedAt: new Date() }, [{ type: "ENDED", actorId: actor.id }], actor.id);
  for (const a of activeOf(task).filter((a) => a.userId !== actor.id)) {
    await notify({ userId: a.userId, type: "TASK_ENDED", title: `Task closed: ${task.title}`, body: `${actor.name} marked this task as ended.`, taskId: task.id });
  }
  return NextResponse.json({ task: updated });
});
