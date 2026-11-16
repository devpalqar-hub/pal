import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody, parseId } from "@/lib/http";
import { badRequest, forbidden, notFound } from "@/lib/auth";
import { updateProjectSchema } from "@/lib/validation";
import { projectAccess } from "@/lib/project-access";

type P = { id: string };

export const GET = authed<P>(async (_req, actor, { id }) => {
  const pid = parseId(id);
  if (!pid) return badRequest("Invalid id");
  const access = await projectAccess(pid, actor);
  if (!access?.canView) return notFound("Project not found");

  const [project, byStatus] = await Promise.all([
    prisma.project.findUnique({
      where: { id: pid },
      include: {
        owner: { select: { id: true, name: true } },
        members: { include: { user: { select: { id: true, name: true, email: true, role: true, designation: true } } } },
      },
    }),
    prisma.task.groupBy({ by: ["status"], where: { projectId: pid }, _count: true }),
  ]);
  const [mem, runningNow, totals] = await Promise.all([
    prisma.taskAssignee.groupBy({ by: ["userId"], where: { task: { projectId: pid } }, _sum: { workedSeconds: true } }),
    prisma.taskAssignee.findMany({ where: { task: { projectId: pid }, status: "ASSIGNED", lastResumedAt: { not: null } }, select: { userId: true, lastResumedAt: true } }),
    prisma.task.aggregate({ where: { projectId: pid }, _sum: { workedSeconds: true, estimatedMinutes: true } }),
  ]);
  const nowMs = Date.now();
  const timeByMember: Record<number, number> = {};
  mem.forEach((g) => { timeByMember[g.userId] = g._sum.workedSeconds ?? 0; });
  runningNow.forEach((r) => { timeByMember[r.userId] = (timeByMember[r.userId] ?? 0) + Math.max(0, Math.floor((nowMs - r.lastResumedAt!.getTime()) / 1000)); });
  const loggedSeconds = (totals._sum.workedSeconds ?? 0) + runningNow.reduce((n, r) => n + Math.max(0, Math.floor((nowMs - r.lastResumedAt!.getTime()) / 1000)), 0);
  const taskCounts = Object.fromEntries(byStatus.map((g) => [g.status, g._count]));
  const total = byStatus.reduce((n, g) => n + g._count, 0);
  const progress = total ? Math.round(((taskCounts.ENDED ?? 0) / total) * 100) : 0;
  return NextResponse.json({ project, taskCounts, progress, canManage: access.canManage, loggedSeconds, estimatedMinutes: totals._sum.estimatedMinutes ?? 0, timeByMember, workingNow: runningNow.length });
});

export const PATCH = authed<P>(async (req, actor, { id }) => {
  const pid = parseId(id);
  if (!pid) return badRequest("Invalid id");
  const access = await projectAccess(pid, actor);
  if (!access?.canView) return notFound("Project not found");
  if (!access.canManage) return forbidden();

  const body = await parseBody(req, updateProjectSchema);
  if ("error" in body) return body.error;
  const { startDate, dueDate, ...rest } = body.data;
  const project = await prisma.project.update({
    where: { id: pid },
    data: {
      ...rest,
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
    },
  });
  return NextResponse.json({ project });
});
