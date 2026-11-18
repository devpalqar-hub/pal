import { NextResponse } from "next/server";
import type { Prisma, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/http";
import { enforceShiftEnd } from "@/lib/day-timer";
import { taskInclude, withLiveTime } from "@/lib/task-flow";

/**
 * My work queue across projects (tasks shared with others included). ?status= filters.
 * ?role=reviewer  → waiting on my review
 * ?role=assigner  → tasks I handed to other people (I created them or assigned someone), whoever is on them now
 */
export const GET = authed(async (req, actor) => {
  await enforceShiftEnd(actor.id);
  const q = new URL(req.url).searchParams;
  const role = q.get("role");
  let where: Prisma.TaskWhereInput;
  if (role === "reviewer") where = { reviewerId: actor.id, status: "IN_REVIEW" };
  else if (role === "assigner") {
    where = {
      OR: [{ createdById: actor.id }, { events: { some: { type: "ASSIGNED", actorId: actor.id } } }],
      assignees: { some: { userId: { not: actor.id } } },
    };
  } else where = { assignees: { some: { userId: actor.id, status: "ASSIGNED" } } };
  if (q.get("status")) where.status = q.get("status") as TaskStatus;

  const tasks = await prisma.task.findMany({
    where,
    include: { ...taskInclude, project: { select: { id: true, name: true } }, parent: { select: { id: true, title: true, status: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: role === "assigner" ? 500 : undefined,
  });
  return NextResponse.json({ tasks: tasks.map((t) => withLiveTime(t, actor.id)) });
});
