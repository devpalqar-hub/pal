import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authed, parseBody } from "@/lib/http";
import { conflict, forbidden } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { activeOf, applyTransition, mineOf, taskCtx } from "@/lib/task-flow";

const schema = z.object({ reason: z.string().trim().min(5, "Please explain why you are declining (at least 5 characters)").max(1000) });

/** Decline a task assigned to you, with a reason that is sent to whoever created it. Only before you have started. */
export const POST = authed<{ id: string }>(async (req, actor, { id }) => {
  const ctx = await taskCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const { task } = ctx;
  const mine = mineOf(task, actor.id);
  if (!mine) return forbidden();
  if (["COMPLETED", "IN_REVIEW", "ENDED"].includes(task.status)) return conflict(`This task is already ${task.status.toLowerCase().replace("_", " ")}`);
  if (mine.startedAt || mine.workedSeconds > 0 || mine.doneAt) {
    return conflict("You have already worked on this task. Ask the task owner or a manager to reassign it instead.");
  }

  const body = await parseBody(req, schema);
  if ("error" in body) return body.error;
  const { reason } = body.data;

  const remaining = activeOf(task).filter((a) => a.id !== mine.id);
  const updated = await applyTransition(
    task.id,
    { assigneeId: remaining[0]?.userId ?? null },
    [{ type: "ASSIGNMENT_REJECTED", actorId: actor.id, note: reason }],
    actor.id,
    [prisma.taskAssignee.update({ where: { id: mine.id }, data: { status: "REJECTED", rejectReason: reason, rejectedAt: new Date() } })],
  );
  if (task.createdById !== actor.id) {
    await notify({ userId: task.createdById, type: "TASK_DECLINED", title: `Declined: ${task.title}`, body: `${actor.name} declined this task — “${reason}”${remaining.length ? "" : " (no one is assigned now)"}`, taskId: task.id });
  }
  return NextResponse.json({ task: updated, stillAssigned: remaining.length });
});
