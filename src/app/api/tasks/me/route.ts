import { NextResponse } from "next/server";
import type { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/http";
import { taskInclude, withLiveTime } from "@/lib/task-flow";

/** My work queue across projects. ?status= filters; ?role=reviewer shows tasks waiting on my review. */
export const GET = authed(async (req, actor) => {
  const q = new URL(req.url).searchParams;
  const asReviewer = q.get("role") === "reviewer";
  const tasks = await prisma.task.findMany({
    where: {
      ...(asReviewer ? { reviewerId: actor.id, status: "IN_REVIEW" } : { assigneeId: actor.id }),
      ...(q.get("status") && { status: q.get("status") as TaskStatus }),
    },
    include: { ...taskInclude, project: { select: { id: true, name: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ tasks: tasks.map(withLiveTime) });
});
