import { prisma } from "./prisma";
import { istDateKey, istInstant } from "./time";
import { recomputeDay, stateFromEvents } from "./attendance";
import { elapsedSeconds, workingStatus } from "./task-flow";

/**
 * Pauses every task timer the user has running, as of `at`.
 * The day timer ("main timer") is the master: whenever it pauses or stops, all task timers pause with it.
 */
export async function pauseTaskTimers(userId: number, at: Date, note: string) {
  const running = await prisma.taskAssignee.findMany({
    where: { userId, status: "ASSIGNED", lastResumedAt: { not: null } },
    include: { task: { include: { assignees: true } } },
  });
  for (const r of running) {
    const add = elapsedSeconds(r, at);
    const others = r.task.assignees.filter((a) => a.status === "ASSIGNED" && a.id !== r.id);
    await prisma.$transaction([
      prisma.taskAssignee.update({ where: { id: r.id }, data: { lastResumedAt: null, workedSeconds: { increment: add } } }),
      prisma.task.update({ where: { id: r.taskId }, data: { status: workingStatus(others, true), workedSeconds: { increment: add } } }),
      prisma.taskEvent.create({ data: { taskId: r.taskId, type: "PAUSED", actorId: userId, note, at } }),
    ]);
  }
  return running.length;
}

type OpenDay = Awaited<ReturnType<typeof loadOpenDays>>[number];

const loadOpenDays = (userId?: number) =>
  prisma.attendanceDay.findMany({
    // today and yesterday cover a session that was left running past midnight
    where: { ...(userId && { userId }), date: { gte: new Date(istDateKey().getTime() - 86_400_000) }, status: "IN_PROGRESS" },
    include: { events: { orderBy: { at: "asc" } }, user: { select: { isActive: true, schedule: true } } },
  });

/**
 * If the day is running and the shift end time has passed, pause it at exactly the end time.
 * Once the person resumes after the end time the day is no longer touched, so they can carry on working.
 */
async function autoPauseDay(day: OpenDay, now: Date) {
  const schedule = day.user.schedule;
  if (!schedule || !day.user.isActive || stateFromEvents(day.events) !== "WORKING") return false;
  const endAt = istInstant(day.date, schedule.endTime);
  if (now < endAt) return false;
  const lastActive = day.events[day.events.length - 1].at;
  if (lastActive >= endAt) return false; // started / resumed after the end time on purpose
  await prisma.workEvent.create({ data: { attendanceId: day.id, type: "PAUSE", at: endAt, auto: true } });
  await recomputeDay(day.id, schedule);
  await pauseTaskTimers(day.userId, endAt, "Auto-paused: shift end time reached");
  return true;
}

/** Lazy check for one user; call before reading their day / task timers. */
export async function enforceShiftEnd(userId: number, now = new Date()) {
  let paused = false;
  for (const d of await loadOpenDays(userId)) paused = (await autoPauseDay(d, now)) || paused;
  return paused;
}

/** Background check for everyone (run every minute from instrumentation.ts). */
export async function sweepShiftEnds(now = new Date()) {
  let n = 0;
  for (const d of await loadOpenDays()) if (await autoPauseDay(d, now)) n++;
  return n;
}

/** Current state of the person's day timer, after applying the shift-end rule. */
export async function dayState(userId: number) {
  await enforceShiftEnd(userId);
  const day = await prisma.attendanceDay.findUnique({
    where: { userId_date: { userId, date: istDateKey() } },
    include: { events: { orderBy: { at: "asc" } } },
  });
  return stateFromEvents(day?.events ?? []);
}
