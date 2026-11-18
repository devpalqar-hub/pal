import type { Role } from "@prisma/client";
import { prisma } from "./prisma";
import type { AuthUser } from "./auth";
import { rank } from "./roles";
import { istDateKey } from "./time";
import { stateFromEvents, totals } from "./attendance";
import { sweepShiftEnds } from "./day-timer";
import { teamRoles } from "./analytics";
import { leaveBalance } from "./leave";

const DAY = 86_400_000;
const OPEN = ["TODO", "IN_PROGRESS", "PAUSED", "IN_REVIEW"] as const;
const key = (d: Date) => d.toISOString().slice(0, 10);

/** Team leads, managers, company heads (and super admins) can see the work of everyone ranked below them. */
export const canOversee = (r: Role) => rank(r) >= rank("LEAD");

/** Can `actor` look at `target`'s work? Only people ranked below the actor. */
export const canOverseeUser = (actor: AuthUser, target: { role: Role; id: number }) =>
  canOversee(actor.role) && target.id !== actor.id && teamRoles(actor).includes(target.role);

/** Work-culture score (0–100) from how regularly, punctually and fully someone works and delivers. */
export function cultureScore(m: { attendanceRate: number; punctuality: number; targetMet: number; onTimeTasks: number | null }) {
  const parts: [number, number][] = [[m.attendanceRate, 35], [m.punctuality, 25], [m.targetMet, 20]];
  if (m.onTimeTasks !== null) parts.push([m.onTimeTasks, 20]);
  const weight = parts.reduce((n, [, w]) => n + w, 0);
  return Math.round(parts.reduce((n, [v, w]) => n + v * w, 0) / weight);
}
export const cultureLabel = (s: number) => (s >= 85 ? "Excellent" : s >= 70 ? "Good" : s >= 50 ? "Fair" : "Needs attention");

/** Work-culture metrics over the last `days` IST days, from attendance rows and finished tasks. */
async function cultureFor(userIds: number[], days: number) {
  const today = istDateKey();
  const from = new Date(today.getTime() - (days - 1) * DAY);
  const [schedules, att, leaves, done] = await Promise.all([
    prisma.workSchedule.findMany({ where: { userId: { in: userIds } } }),
    prisma.attendanceDay.findMany({ where: { userId: { in: userIds }, date: { gte: from } }, include: { events: { orderBy: { at: "asc" } } } }),
    prisma.leaveRequest.findMany({ where: { userId: { in: userIds }, status: "APPROVED", endDate: { gte: from }, startDate: { lte: today } } }),
    prisma.taskAssignee.findMany({
      where: { userId: { in: userIds }, status: "ASSIGNED", doneAt: { gte: from } },
      select: { userId: true, doneAt: true, task: { select: { dueDate: true } } },
    }),
  ]);
  const sched = new Map(schedules.map((s) => [s.userId, s]));
  const out = new Map<number, ReturnType<typeof compute>>();

  function compute(uid: number) {
    const s = sched.get(uid);
    const workingDays = (s?.workingDays as number[] | undefined) ?? [1, 2, 3, 4, 5];
    const required = s?.requiredMinutes ?? 480;
    const mine = new Map(att.filter((a) => a.userId === uid).map((a) => [key(a.date), a]));
    const leaveDays = new Set<string>();
    for (const l of leaves.filter((l) => l.userId === uid)) {
      for (let t = Math.max(l.startDate.getTime(), from.getTime()); t <= Math.min(l.endDate.getTime(), today.getTime()); t += DAY) leaveDays.add(key(new Date(t)));
    }
    const rows: { date: string; workedMinutes: number; breakMinutes: number; status: string | null; isLate: boolean; lateMinutes: number; earlyMinutes: number; isWorkingDay: boolean; onLeave: boolean; firstStartAt: Date | null; lastStopAt: Date | null }[] = [];
    let expected = 0, attended = 0, onTime = 0, metTarget = 0, late = 0, early = 0, workSum = 0, breakSum = 0;
    for (let i = 0; i < days; i++) {
      const d = new Date(from.getTime() + i * DAY);
      const a = mine.get(key(d));
      const isToday = d.getTime() === today.getTime();
      const isWorkingDay = workingDays.includes(d.getUTCDay());
      const onLeave = leaveDays.has(key(d));
      const t = a && isToday ? totals(a.events) : null;
      const worked = a ? (t ? Math.floor(t.work) : a.totalWorkMinutes) : 0;
      const brk = a ? (t ? Math.floor(t.brk) : a.totalBreakMinutes) : 0;
      rows.push({ date: key(d), workedMinutes: worked, breakMinutes: brk, status: a?.status ?? null, isLate: a?.isLate ?? false, lateMinutes: a?.lateMinutes ?? 0, earlyMinutes: a?.earlyMinutes ?? 0, isWorkingDay, onLeave, firstStartAt: a?.firstStartAt ?? null, lastStopAt: a?.lastStopAt ?? null });
      if (!isWorkingDay || onLeave) continue;
      if (isToday && !a) continue; // the day has not started yet
      expected++;
      if (a && worked > 0) {
        attended++;
        workSum += worked;
        breakSum += brk;
        if (a.isLate) late++; else onTime++;
        if (a.isEarlyCheckout) early++;
        if (worked >= required) metTarget++;
      }
    }
    const tasks = done.filter((r) => r.userId === uid);
    const dated = tasks.filter((r) => r.task.dueDate);
    const onTimeCount = dated.filter((r) => r.doneAt! <= new Date(r.task.dueDate!.getTime() + DAY)).length;
    const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
    const m = {
      days,
      attendanceRate: expected ? pct(attended, expected) : 100,
      punctuality: attended ? pct(onTime, attended) : 0,
      targetMet: attended ? pct(metTarget, attended) : 0,
      onTimeTasks: dated.length ? pct(onTimeCount, dated.length) : (null as number | null),
      avgWorkMinutes: attended ? Math.round(workSum / attended) : 0,
      avgBreakMinutes: attended ? Math.round(breakSum / attended) : 0,
      lateDays: late,
      earlyCheckouts: early,
      absentDays: Math.max(0, expected - attended),
      expectedDays: expected,
      tasksDone: tasks.length,
    };
    const score = attended || expected ? cultureScore(m) : 0;
    return { ...m, score, label: cultureLabel(score), requiredMinutes: required, rows };
  }
  userIds.forEach((id) => out.set(id, compute(id)));
  return out;
}

const personalStatus = (taskStatus: string, doneAt: Date | null) =>
  taskStatus === "ENDED" || taskStatus === "IN_REVIEW" || taskStatus === "COMPLETED" ? taskStatus : doneAt ? "COMPLETED" : taskStatus;

/** Everyone under the caller with today's status, task load and 30-day work culture. */
export async function teamOverview(actor: AuthUser, days = 30) {
  await sweepShiftEnds();
  const members = await prisma.user.findMany({
    where: { role: { in: teamRoles(actor) }, isActive: true, id: { not: actor.id } },
    select: { id: true, name: true, email: true, role: true, designation: true },
    orderBy: { name: "asc" },
  });
  const ids = members.map((m) => m.id);
  const today = istDateKey();
  const [culture, todayAtt, rows, projects] = await Promise.all([
    cultureFor(ids, days),
    prisma.attendanceDay.findMany({ where: { userId: { in: ids }, date: today }, include: { events: { orderBy: { at: "asc" } } } }),
    prisma.taskAssignee.findMany({
      where: { userId: { in: ids }, status: "ASSIGNED" },
      select: { userId: true, doneAt: true, lastResumedAt: true, task: { select: { id: true, title: true, status: true, dueDate: true } } },
    }),
    prisma.projectMember.findMany({ where: { userId: { in: ids }, project: { status: { not: "ARCHIVED" } } }, select: { userId: true } }),
  ]);
  const att = new Map(todayAtt.map((a) => [a.userId, a]));
  const projectCount = new Map<number, number>();
  projects.forEach((p) => projectCount.set(p.userId, (projectCount.get(p.userId) ?? 0) + 1));

  const out = members.map((m) => {
    const a = att.get(m.id);
    const mine = rows.filter((r) => r.userId === m.id);
    const counts: Record<string, number> = {};
    let overdue = 0;
    let working: { id: number; title: string } | null = null;
    for (const r of mine) {
      const st = personalStatus(r.task.status, r.doneAt);
      counts[st] = (counts[st] ?? 0) + 1;
      if ((OPEN as readonly string[]).includes(st) && r.task.dueDate && r.task.dueDate < today) overdue++;
      if (r.lastResumedAt) working = { id: r.task.id, title: r.task.title };
    }
    const c = culture.get(m.id)!;
    return {
      ...m,
      today: { state: stateFromEvents(a?.events ?? []), workedMinutes: a ? Math.floor(totals(a.events).work) : 0, isLate: a?.isLate ?? false, firstStartAt: a?.firstStartAt ?? null, autoPaused: a ? a.events[a.events.length - 1]?.auto === true : false },
      tasks: { byStatus: counts, open: OPEN.reduce((n, s) => n + (counts[s] ?? 0), 0), overdue, working },
      projects: projectCount.get(m.id) ?? 0,
      culture: { score: c.score, label: c.label, attendanceRate: c.attendanceRate, punctuality: c.punctuality, avgWorkMinutes: c.avgWorkMinutes, lateDays: c.lateDays },
    };
  });
  const sum = (f: (m: (typeof out)[number]) => boolean) => out.filter(f).length;
  return {
    days,
    summary: {
      total: out.length,
      working: sum((m) => m.today.state === "WORKING"),
      paused: sum((m) => m.today.state === "PAUSED"),
      checkedOut: sum((m) => m.today.state === "STOPPED"),
      notStarted: sum((m) => m.today.state === "NOT_STARTED"),
      overdue: out.reduce((n, m) => n + m.tasks.overdue, 0),
      avgScore: out.length ? Math.round(out.reduce((n, m) => n + m.culture.score, 0) / out.length) : 0,
    },
    members: out,
  };
}

/** One person: their tasks (across all projects) with status and time, plus full work-culture breakdown. */
export async function memberDetail(target: { id: number }, days = 30) {
  await sweepShiftEnds();
  const [user, culture, assignments, memberships, leave, upcomingLeave] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: target.id }, select: { id: true, name: true, email: true, mailEmail: true, role: true, designation: true, isActive: true, createdAt: true, schedule: true } }),
    cultureFor([target.id], days),
    prisma.taskAssignee.findMany({
      where: { userId: target.id, status: "ASSIGNED" },
      include: { task: { select: { id: true, title: true, status: true, priority: true, dueDate: true, estimatedMinutes: true, completedAt: true, project: { select: { id: true, name: true } }, _count: { select: { subtasks: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.projectMember.findMany({
      where: { userId: target.id },
      select: { role: true, createdAt: true, project: { select: { id: true, name: true, status: true, dueDate: true } } },
      orderBy: { createdAt: "desc" },
    }),
    leaveBalance(target.id),
    prisma.leaveRequest.findMany({ where: { userId: target.id, status: { in: ["APPROVED", "PENDING"] }, endDate: { gte: istDateKey() } }, orderBy: { startDate: "asc" }, take: 5, select: { id: true, startDate: true, endDate: true, days: true, type: true, status: true } }),
  ]);
  const todayAtt = await prisma.attendanceDay.findUnique({ where: { userId_date: { userId: target.id, date: istDateKey() } }, include: { events: { orderBy: { at: "asc" } } } });
  const now = Date.now();
  const today = istDateKey();
  const tasks = assignments.map((a) => {
    const running = !!a.lastResumedAt;
    const live = a.workedSeconds + (running ? Math.max(0, Math.floor((now - a.lastResumedAt!.getTime()) / 1000)) : 0);
    const status = personalStatus(a.task.status, a.doneAt);
    return {
      id: a.task.id,
      title: a.task.title,
      status,
      priority: a.task.priority,
      project: a.task.project,
      subtasks: a.task._count.subtasks,
      dueDate: a.task.dueDate,
      estimatedMinutes: a.task.estimatedMinutes,
      workedSeconds: live,
      isRunning: running,
      startedAt: a.startedAt,
      doneAt: a.doneAt,
      overdue: (OPEN as readonly string[]).includes(status) && !!a.task.dueDate && a.task.dueDate < today,
    };
  });
  const byStatus: Record<string, number> = {};
  tasks.forEach((t) => (byStatus[t.status] = (byStatus[t.status] ?? 0) + 1));
  const doneTasks = tasks.filter((t) => t.status === "COMPLETED" || t.status === "ENDED");
  const totalSeconds = tasks.reduce((n, t) => n + t.workedSeconds, 0);
  return {
    user,
    profile: {
      projects: memberships.map((m) => ({ ...m.project, projectRole: m.role, joinedAt: m.createdAt })),
      leave,
      upcomingLeave,
      lifetime: { tasks: tasks.length, done: doneTasks.length, loggedSeconds: totalSeconds },
    },
    today: {
      state: stateFromEvents(todayAtt?.events ?? []),
      workedMinutes: todayAtt ? Math.floor(totals(todayAtt.events).work) : 0,
      breakMinutes: todayAtt ? Math.floor(totals(todayAtt.events).brk) : 0,
      firstStartAt: todayAtt?.firstStartAt ?? null,
      isLate: todayAtt?.isLate ?? false,
      autoPaused: todayAtt ? todayAtt.events[todayAtt.events.length - 1]?.auto === true : false,
    },
    culture: culture.get(target.id)!,
    tasks,
    taskSummary: { byStatus, open: tasks.filter((t) => (OPEN as readonly string[]).includes(t.status)).length, overdue: tasks.filter((t) => t.overdue).length },
  };
}
