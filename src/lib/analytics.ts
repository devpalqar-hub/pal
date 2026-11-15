import type { Role } from "@prisma/client";
import { prisma } from "./prisma";
import type { AuthUser } from "./auth";
import { rank, ROLE_RANK } from "./roles";
import { istDateKey } from "./time";
import { stateFromEvents, totals } from "./attendance";
import { leaveBalance } from "./leave";

const DAY = 86_400_000;
const OPEN = ["TODO", "IN_PROGRESS", "PAUSED", "IN_REVIEW"] as const;

/** The last `n` IST calendar days (oldest first) as UTC-midnight keys. */
export function lastDays(n: number) {
  const today = istDateKey().getTime();
  return Array.from({ length: n }, (_, i) => new Date(today - (n - 1 - i) * DAY));
}
const key = (d: Date) => d.toISOString().slice(0, 10);

/** Who counts as "your PALs": SUPER_ADMIN → everyone else; COMPANY_HEAD / MANAGER → every lower role. */
export const canViewTeamAnalytics = (r: Role) => rank(r) >= rank("MANAGER");
export function teamRoles(actor: AuthUser): Role[] {
  return (Object.keys(ROLE_RANK) as Role[]).filter((r) => actor.role === "SUPER_ADMIN" || ROLE_RANK[r] < ROLE_RANK[actor.role]);
}

/** Personal analytics: 7-day attendance, task breakdown, leave balance. */
export async function personalAnalytics(userId: number) {
  const days = lastDays(7);
  const today = days[days.length - 1];
  const [schedule, att, byStatus, overdue, completedWeek, balance] = await Promise.all([
    prisma.workSchedule.findUnique({ where: { userId } }),
    prisma.attendanceDay.findMany({ where: { userId, date: { gte: days[0] } }, include: { events: { orderBy: { at: "asc" } } } }),
    prisma.task.groupBy({ by: ["status"], where: { assigneeId: userId }, _count: true }),
    prisma.task.count({ where: { assigneeId: userId, status: { in: [...OPEN] }, dueDate: { lt: today } } }),
    prisma.task.count({ where: { assigneeId: userId, completedAt: { gte: days[0] } } }),
    leaveBalance(userId),
  ]);
  const byDay = new Map(att.map((a) => [key(a.date), a]));
  const week = days.map((d) => {
    const a = byDay.get(key(d));
    const isToday = d.getTime() === today.getTime();
    const worked = a ? (isToday ? Math.floor(totals(a.events).work) : a.totalWorkMinutes) : 0;
    return { date: key(d), workedMinutes: worked, status: a?.status ?? null, isLate: a?.isLate ?? false, isWorkingDay: !schedule || (schedule.workingDays as number[]).includes(d.getUTCDay()) };
  });
  const counts = Object.fromEntries(byStatus.map((g) => [g.status, g._count]));
  const todayAtt = byDay.get(key(today));
  return {
    requiredMinutes: schedule?.requiredMinutes ?? 480,
    schedule: schedule ? { startTime: schedule.startTime, endTime: schedule.endTime } : null,
    week,
    today: { state: stateFromEvents(todayAtt?.events ?? []), workedMinutes: week[6].workedMinutes, isLate: todayAtt?.isLate ?? false },
    tasks: {
      byStatus: counts,
      open: OPEN.reduce((n, s) => n + (counts[s] ?? 0), 0),
      overdue,
      completedThisWeek: completedWeek,
    },
    leave: balance,
  };
}

/** Team analytics for managers and above. */
export async function teamAnalytics(actor: AuthUser) {
  const roles = teamRoles(actor);
  const members = await prisma.user.findMany({
    where: { role: { in: roles }, isActive: true, id: { not: actor.id } },
    select: { id: true, name: true, role: true, designation: true, email: true, schedule: { select: { requiredMinutes: true, startTime: true } } },
    orderBy: [{ name: "asc" }],
  });
  const ids = members.map((m) => m.id);
  const days = lastDays(7);
  const today = days[6];

  const [att, taskGroups, overdue, completed, leaves] = await Promise.all([
    prisma.attendanceDay.findMany({ where: { userId: { in: ids }, date: { gte: days[0] } }, include: { events: { orderBy: { at: "asc" } } } }),
    prisma.task.groupBy({ by: ["assigneeId", "status"], where: { assigneeId: { in: ids } }, _count: true }),
    prisma.task.groupBy({ by: ["assigneeId"], where: { assigneeId: { in: ids }, status: { in: [...OPEN] }, dueDate: { lt: today } }, _count: true }),
    prisma.task.groupBy({ by: ["assigneeId"], where: { assigneeId: { in: ids }, completedAt: { gte: days[0] } }, _count: true }),
    prisma.leaveRequest.findMany({ where: { userId: { in: ids }, status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } }, select: { userId: true, type: true, halfDay: true } }),
  ]);

  const attBy = new Map<number, Map<string, (typeof att)[number]>>();
  att.forEach((a) => {
    if (!attBy.has(a.userId)) attBy.set(a.userId, new Map());
    attBy.get(a.userId)!.set(key(a.date), a);
  });
  const onLeave = new Map(leaves.map((l) => [l.userId, l]));
  const overdueBy = new Map(overdue.map((g) => [g.assigneeId!, g._count]));
  const completedBy = new Map(completed.map((g) => [g.assigneeId!, g._count]));
  const tasksBy = new Map<number, Record<string, number>>();
  const teamTasks: Record<string, number> = {};
  taskGroups.forEach((g) => {
    const m = tasksBy.get(g.assigneeId!) ?? {};
    m[g.status] = g._count;
    tasksBy.set(g.assigneeId!, m);
    teamTasks[g.status] = (teamTasks[g.status] ?? 0) + g._count;
  });

  const summary = { total: members.length, working: 0, onBreak: 0, checkedOut: 0, notCheckedIn: 0, late: 0, onLeave: 0 };
  const rows = members.map((m) => {
    const mine = attBy.get(m.id) ?? new Map();
    const t = mine.get(key(today));
    const state = stateFromEvents(t?.events ?? []);
    const leave = onLeave.get(m.id);
    const status = leave && state === "NOT_STARTED" ? "ON_LEAVE" : state;
    if (status === "WORKING") summary.working++;
    else if (status === "PAUSED") summary.onBreak++;
    else if (status === "STOPPED") summary.checkedOut++;
    else if (status === "ON_LEAVE") summary.onLeave++;
    else summary.notCheckedIn++;
    if (t?.isLate) summary.late++;

    const week = days.map((d) => {
      const a = mine.get(key(d));
      if (!a) return 0;
      return d.getTime() === today.getTime() ? Math.floor(totals(a.events).work) : a.totalWorkMinutes;
    });
    const tc = tasksBy.get(m.id) ?? {};
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      designation: m.designation,
      requiredMinutes: m.schedule?.requiredMinutes ?? 480,
      today: { status, workedMinutes: week[6], isLate: t?.isLate ?? false, lateMinutes: t?.lateMinutes ?? 0, firstStartAt: t?.firstStartAt ?? null },
      week,
      presentDays: [...mine.values()].filter((a) => a.status === "PRESENT" || a.status === "HALF_DAY").length,
      openTasks: OPEN.reduce((n, s) => n + (tc[s] ?? 0), 0),
      inReview: tc.IN_REVIEW ?? 0,
      overdueTasks: overdueBy.get(m.id) ?? 0,
      completed7d: completedBy.get(m.id) ?? 0,
    };
  });

  return { days: days.map(key), summary, tasksByStatus: teamTasks, members: rows };
}

/** Project analytics, scoped to what the caller can see. */
export async function projectAnalytics(actor: AuthUser) {
  const seesAll = actor.role === "SUPER_ADMIN" || actor.role === "COMPANY_HEAD";
  const projects = await prisma.project.findMany({
    where: seesAll ? { status: { not: "ARCHIVED" } } : { status: { not: "ARCHIVED" }, members: { some: { userId: actor.id } } },
    select: { id: true, name: true, status: true, dueDate: true, startDate: true, owner: { select: { id: true, name: true } }, _count: { select: { members: true } } },
    orderBy: { createdAt: "desc" },
  });
  const ids = projects.map((p) => p.id);
  const today = istDateKey();
  const [groups, overdue, logged] = await Promise.all([
    prisma.task.groupBy({ by: ["projectId", "status"], where: { projectId: { in: ids } }, _count: true }),
    prisma.task.groupBy({ by: ["projectId"], where: { projectId: { in: ids }, status: { in: [...OPEN] }, dueDate: { lt: today } }, _count: true }),
    prisma.task.groupBy({ by: ["projectId"], where: { projectId: { in: ids } }, _sum: { workedSeconds: true, estimatedMinutes: true } }),
  ]);
  const by = new Map<number, Record<string, number>>();
  groups.forEach((g) => by.set(g.projectId, { ...(by.get(g.projectId) ?? {}), [g.status]: g._count }));
  const od = new Map(overdue.map((g) => [g.projectId, g._count]));
  const lg = new Map(logged.map((g) => [g.projectId, g._sum]));

  return projects.map((p) => {
    const s = by.get(p.id) ?? {};
    const total = Object.values(s).reduce((a, b) => a + b, 0);
    const done = (s.ENDED ?? 0) + (s.COMPLETED ?? 0);
    const progress = total ? Math.round((done / total) * 100) : 0;
    const overdueTasks = od.get(p.id) ?? 0;
    const daysLeft = p.dueDate ? Math.round((p.dueDate.getTime() - today.getTime()) / DAY) : null;
    let health: "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "DONE" = "ON_TRACK";
    if (p.status === "COMPLETED" || (total > 0 && done === total)) health = "DONE";
    else if (daysLeft !== null && daysLeft < 0) health = "OFF_TRACK";
    else if (overdueTasks > 0 || (daysLeft !== null && daysLeft <= 7 && progress < 70)) health = "AT_RISK";
    return {
      ...p,
      taskCounts: s,
      totalTasks: total,
      progress,
      overdueTasks,
      daysLeft,
      loggedMinutes: Math.floor((lg.get(p.id)?.workedSeconds ?? 0) / 60),
      estimatedMinutes: lg.get(p.id)?.estimatedMinutes ?? 0,
      health,
    };
  });
}
