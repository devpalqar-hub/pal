import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/http";
import { conflict, forbidden } from "@/lib/auth";
import { activeOf, applyTransition, elapsedSeconds, mineOf, taskCtx, workingStatus } from "@/lib/task-flow";

/** Pause YOUR timer. The task stays IN_PROGRESS while anyone else is still running. */
export const POST = authed<{ id: string }>(async (_req, actor, { id }) => {
  const ctx = await taskCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const { task } = ctx;
  const mine = mineOf(task, actor.id);
  if (!mine) return forbidden();
  if (!mine.lastResumedAt) return conflict("Your timer is not running");

  const now = new Date();
  const add = elapsedSeconds(mine, now);
  const others = activeOf(task).filter((a) => a.id !== mine.id);
  const updated = await applyTransition(
    task.id,
    { status: workingStatus(others, true), workedSeconds: { increment: add } },
    [{ type: "PAUSED", actorId: actor.id }],
    actor.id,
    [prisma.taskAssignee.update({ where: { id: mine.id }, data: { lastResumedAt: null, workedSeconds: { increment: add } } })],
  );
  return NextResponse.json({ task: updated });
});
