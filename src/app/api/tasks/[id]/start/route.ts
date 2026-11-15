import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/http";
import { conflict, forbidden } from "@/lib/auth";
import { applyTransition, taskCtx } from "@/lib/task-flow";

/** Start (TODO) or resume (PAUSED) the timer. Only the assignee, one running task at a time. */
export const POST = authed<{ id: string }>(async (_req, actor, { id }) => {
  const ctx = await taskCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const { task } = ctx;
  if (task.assigneeId !== actor.id) return forbidden();
  if (task.status !== "TODO" && task.status !== "PAUSED") return conflict(`Cannot start a task that is ${task.status}`);

  const running = await prisma.task.findFirst({
    where: { assigneeId: actor.id, status: "IN_PROGRESS" },
    select: { id: true, title: true },
  });
  if (running) return conflict("Pause your running task first", { runningTask: running });

  const now = new Date();
  const updated = await applyTransition(
    task.id,
    { status: "IN_PROGRESS", startedAt: task.startedAt ?? now, lastResumedAt: now },
    [{ type: task.status === "TODO" ? "STARTED" : "RESUMED", actorId: actor.id }],
  );
  return NextResponse.json({ task: updated });
});
