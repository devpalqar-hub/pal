import type { Prisma, Task, TaskAssignee, TaskEventType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { notFound, type AuthUser } from "./auth";
import { projectAccess, type ProjectAccess } from "./project-access";

export const taskInclude = {
  assignee: { select: { id: true, name: true, role: true } },
  assignees: { include: { user: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: "asc" } },
  reviewer: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
  _count: { select: { subtasks: true } },
} satisfies Prisma.TaskInclude;

type WithAssignees = Pick<Task, "workedSeconds"> & { assignees?: TaskAssignee[] };

const secondsSince = (d: Date | null, now: number) => (d ? Math.max(0, Math.floor((now - d.getTime()) / 1000)) : 0);

/**
 * Adds live time. Every assignee has their own timer; the task total is the sum of all of them,
 * including intervals that are still running.
 */
export function withLiveTime<T extends WithAssignees>(t: T, viewerId?: number) {
  const now = Date.now();
  const assignees = (t.assignees ?? []).map((a) => {
    const isRunning = a.status === "ASSIGNED" && !!a.lastResumedAt;
    return { ...a, isRunning, liveSeconds: a.workedSeconds + (isRunning ? secondsSince(a.lastResumedAt, now) : 0) };
  });
  const runningCount = assignees.filter((a) => a.isRunning).length;
  const live = assignees.reduce((n, a) => n + (a.isRunning ? secondsSince(a.lastResumedAt, now) : 0), 0);
  const workedSeconds = t.workedSeconds + live;
  return {
    ...t,
    assignees,
    workedSeconds,
    workedMinutes: Math.floor(workedSeconds / 60),
    runningCount,
    isTimerRunning: runningCount > 0,
    mine: viewerId ? assignees.find((a) => a.userId === viewerId && a.status === "ASSIGNED") ?? null : null,
  };
}

export const activeOf = (t: { assignees: TaskAssignee[] }) => t.assignees.filter((a) => a.status === "ASSIGNED");
export const mineOf = (t: { assignees: TaskAssignee[] }, userId: number) => activeOf(t).find((a) => a.userId === userId);
/** Responsible for the work: an active assignee, or the creator for tasks nobody is assigned to (containers). */
export const isWorkOwner = (t: { assignees: TaskAssignee[]; createdById: number }, userId: number) => {
  const act = activeOf(t);
  return act.length ? act.some((a) => a.userId === userId) : t.createdById === userId;
};
export const elapsedSeconds = (a: Pick<TaskAssignee, "lastResumedAt">, now: Date) => secondsSince(a.lastResumedAt, now.getTime());

export type TaskWithSubs = Task & { subtasks: { id: number; status: Task["status"] }[]; assignees: TaskAssignee[] };

/** Loads a task plus the caller's access to its project. 404 if the caller can't see it. */
export async function taskCtx(idParam: string, actor: AuthUser): Promise<{ task: TaskWithSubs; access: ProjectAccess } | { error: Response }> {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id < 1) return { error: NextResponse.json({ error: "Invalid id" }, { status: 400 }) };
  const task = await prisma.task.findUnique({
    where: { id },
    include: { subtasks: { select: { id: true, status: true } }, assignees: { orderBy: { createdAt: "asc" } } },
  });
  if (!task) return { error: notFound("Task not found") };
  const access = await projectAccess(task.projectId, actor);
  if (!access?.canView) return { error: notFound("Task not found") };
  return { task, access };
}

/** Applies assignee changes + the task update + audit events in one transaction. */
export async function applyTransition(
  taskId: number,
  data: Prisma.TaskUncheckedUpdateInput,
  events: { type: TaskEventType; actorId: number; note?: string }[],
  viewerId?: number,
  ops: Prisma.PrismaPromise<unknown>[] = [],
) {
  const res = await prisma.$transaction([
    ...ops,
    prisma.task.update({ where: { id: taskId }, data, include: taskInclude }),
    prisma.taskEvent.createMany({ data: events.map((e) => ({ taskId, ...e })) }),
  ]);
  return withLiveTime(res[ops.length] as Awaited<ReturnType<typeof prisma.task.update>> & { assignees: TaskAssignee[] }, viewerId);
}

export const openSubtasks = (t: TaskWithSubs) => t.subtasks.filter((s) => s.status !== "COMPLETED" && s.status !== "ENDED").length;

/** Status while work is under way, from what everyone's timers are doing. */
export function workingStatus(assignees: Pick<TaskAssignee, "lastResumedAt" | "startedAt">[], taskStarted: boolean) {
  if (assignees.some((a) => a.lastResumedAt)) return "IN_PROGRESS" as const;
  return taskStarted || assignees.some((a) => a.startedAt) ? ("PAUSED" as const) : ("TODO" as const);
}

/** Validates a reviewer: must be a project member (or senior) and not one of the assignees. */
export async function validateReviewer(reviewerId: number, task: TaskWithSubs, access: ProjectAccess): Promise<Response | null> {
  if (activeOf(task).some((a) => a.userId === reviewerId)) {
    return NextResponse.json({ error: "Reviewer cannot be one of the assignees" }, { status: 400 });
  }
  if (!access.memberIds.includes(reviewerId)) {
    const u = await prisma.user.findUnique({ where: { id: reviewerId }, select: { role: true, isActive: true } });
    if (!u?.isActive || (u.role !== "COMPANY_HEAD" && u.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Reviewer must be a project member" }, { status: 400 });
    }
  }
  return null;
}
