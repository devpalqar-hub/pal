import { NextResponse } from "next/server";
import type { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/http";
import { enforceShiftEnd } from "@/lib/day-timer";
import { taskInclude, withLiveTime } from "@/lib/task-flow";

/** My work queue across projects (tasks shared with others included). ?status= filters; ?role=reviewer = waiting on my review. */
export const GET = authed(async (req, actor) => {
  await enforceShiftEnd(actor.id);
  const q = new URL(req.url).searchParams;
  const asReviewer = q.get("role") === "reviewer";
  const tasks = await prisma.task.findMany({
    where: {
      ...(asReviewer ? { reviewerId: actor.id, status: "IN_REVIEW" } : { assignees: { some: { userId: actor.id, status: "ASSIGNED" } } }),
      ...(q.get("status") && { status: q.get("status") as TaskStatus }),
    },
    include: { ...taskInclude, project: { select: { id: true, name: true } }, parent: { select: { id: true, title: true, status: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ tasks: tasks.map((t) => withLiveTime(t, actor.id)) });
});
