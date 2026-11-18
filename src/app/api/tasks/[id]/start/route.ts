import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/http";
import { conflict, forbidden } from "@/lib/auth";
import { dayState } from "@/lib/day-timer";
import { applyTransition, mineOf, taskCtx } from "@/lib/task-flow";

/** Start / resume YOUR timer on this task. Several assignees can run their own timers at the same time. */
export const POST = authed<{ id: string }>(async (_req, actor, { id }) => {
  const ctx = await taskCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const { task } = ctx;
  const mine = mineOf(task, actor.id);
  if (!mine) return forbidden();
  if (["COMPLETED", "IN_REVIEW", "ENDED"].includes(task.status)) return conflict(`Cannot start a task that is ${task.status}`);
  if (mine.doneAt) return conflict("You have already finished your part of this task");
  if (mine.lastResumedAt) return conflict("Your timer is already running");

  const state = await dayState(actor.id);
  if (state !== "WORKING") {
    return conflict(state === "PAUSED" ? "Your day timer is paused — resume it to continue working on tasks" : "Start your work day first, then start the task", { dayState: state });
  }

  const running = await prisma.taskAssignee.findFirst({
    where: { userId: actor.id, lastResumedAt: { not: null }, task: { id: { not: task.id } } },
    select: { task: { select: { id: true, title: true } } },
  });
  if (running) return conflict("Pause your running task first", { runningTask: running.task });

  const now = new Date();
  const updated = await applyTransition(
    task.id,
    { status: "IN_PROGRESS", startedAt: task.startedAt ?? now },
    [{ type: mine.startedAt ? "RESUMED" : "STARTED", actorId: actor.id }],
    actor.id,
    [prisma.taskAssignee.update({ where: { id: mine.id }, data: { lastResumedAt: now, startedAt: mine.startedAt ?? now } })],
  );
  return NextResponse.json({ task: updated });
});
