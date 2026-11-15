import { NextResponse } from "next/server";
import { authed } from "@/lib/http";
import { conflict, forbidden } from "@/lib/auth";
import { applyTransition, stopTimer, taskCtx } from "@/lib/task-flow";

export const POST = authed<{ id: string }>(async (_req, actor, { id }) => {
  const ctx = await taskCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const { task } = ctx;
  if (task.assigneeId !== actor.id) return forbidden();
  if (task.status !== "IN_PROGRESS") return conflict(`Cannot pause a task that is ${task.status}`);

  const updated = await applyTransition(task.id, { status: "PAUSED", ...stopTimer(task, new Date()) }, [
    { type: "PAUSED", actorId: actor.id },
  ]);
  return NextResponse.json({ task: updated });
});
