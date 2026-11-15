import type { Prisma, Task, TaskEventType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { forbidden, notFound, type AuthUser } from "./auth";
import { projectAccess, type ProjectAccess } from "./project-access";

export const taskInclude = {
  assignee: { select: { id: true, name: true, role: true } },
  reviewer: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
  _count: { select: { subtasks: true } },
} satisfies Prisma.TaskInclude;

/** Adds live tracked time (includes the currently running interval). */
export function withLiveTime<T extends Pick<Task, "workedSeconds" | "lastResumedAt" | "status">>(t: T) {
  const running =
    t.status === "IN_PROGRESS" && t.lastResumedAt ? Math.floor((Date.now() - t.lastResumedAt.getTime()) / 1000) : 0;
  const seconds = t.workedSeconds + running;
  return { ...t, workedSeconds: seconds, workedMinutes: Math.floor(seconds / 60), isTimerRunning: t.status === "IN_PROGRESS" };
}

/** Closes the running interval (if any) and returns the timer fields to persist. */
export function stopTimer(task: Pick<Task, "workedSeconds" | "lastResumedAt">, now: Date) {
  const add = task.lastResumedAt ? Math.max(0, Math.floor((now.getTime() - task.lastResumedAt.getTime()) / 1000)) : 0;
  return { workedSeconds: task.workedSeconds + add, lastResumedAt: null };
}

/** The person responsible for the work: assignee, or the creator for unassigned container tasks. */
export const workOwnerId = (t: Pick<Task, "assigneeId" | "createdById">) => t.assigneeId ?? t.createdById;

/** Loads a task plus the caller's access to its project. 404 if the caller can't see it. */
export async function taskCtx(idParam: string, actor: AuthUser): Promise<{ task: TaskWithSubs; access: ProjectAccess } | { error: Response }> {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id < 1) return { error: NextResponse.json({ error: "Invalid id" }, { status: 400 }) };
  const task = await prisma.task.findUnique({ where: { id }, include: { subtasks: { select: { id: true, status: true } } } });
  if (!task) return { error: notFound("Task not found") };
  const access = await projectAccess(task.projectId, actor);
  if (!access?.canView) return { error: notFound("Task not found") };
  return { task, access };
}
export type TaskWithSubs = Task & { subtasks: { id: number; status: Task["status"] }[] };

/** Applies a status change and writes the audit events atomically. */
export async function applyTransition(
  taskId: number,
  data: Prisma.TaskUncheckedUpdateInput,
  events: { type: TaskEventType; actorId: number; note?: string }[],
) {
  const [task] = await prisma.$transaction([
    prisma.task.update({ where: { id: taskId }, data, include: taskInclude }),
    prisma.taskEvent.createMany({ data: events.map((e) => ({ taskId, ...e })) }),
  ]);
  return withLiveTime(task);
}

export const openSubtasks = (t: TaskWithSubs) =>
  t.subtasks.filter((s) => s.status !== "COMPLETED" && s.status !== "ENDED").length;

/** Validates a reviewer: must be a project member (or manager) and not the assignee. */
export async function validateReviewer(reviewerId: number, task: Task, access: ProjectAccess): Promise<Response | null> {
  if (reviewerId === task.assigneeId) {
    return NextResponse.json({ error: "Reviewer cannot be the assignee" }, { status: 400 });
  }
  if (!access.memberIds.includes(reviewerId)) {
    const u = await prisma.user.findUnique({ where: { id: reviewerId }, select: { role: true, isActive: true } });
    if (!u?.isActive || (u.role !== "COMPANY_HEAD" && u.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Reviewer must be a project member" }, { status: 400 });
    }
  }
  return null;
}

export { forbidden };
