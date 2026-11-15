import type { WorkEvent, WorkEventType, WorkSchedule, AttendanceStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { istDateKey, istMinuteOfDay } from "./time";

const DEFAULT_REQUIRED = 480;
const DEFAULT_HALF = 240;

/** Calendar date in India Standard Time as a UTC-midnight Date, for @db.Date columns. */
export const dateKey = istDateKey;

const minuteOfDay = istMinuteOfDay;
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const diffMin = (a: Date, b: Date) => Math.max(0, Math.floor((b.getTime() - a.getTime()) / 60000));

export type WorkState = "NOT_STARTED" | "WORKING" | "PAUSED" | "STOPPED";

export function stateFromEvents(events: Pick<WorkEvent, "type">[]): WorkState {
  const last = events[events.length - 1]?.type as WorkEventType | undefined;
  if (!last) return "NOT_STARTED";
  if (last === "START" || last === "RESUME") return "WORKING";
  if (last === "PAUSE") return "PAUSED";
  return "STOPPED";
}

/** Sums worked and paused minutes from an ordered event log. Open intervals run until `now`. */
export function totals(events: Pick<WorkEvent, "type" | "at">[], now = new Date()) {
  let work = 0;
  let brk = 0;
  let workFrom: Date | null = null;
  let pauseFrom: Date | null = null;
  for (const e of events) {
    if (e.type === "START" || e.type === "RESUME") {
      if (pauseFrom) brk += diffMin(pauseFrom, e.at);
      pauseFrom = null;
      workFrom = e.at;
    } else if (e.type === "PAUSE") {
      if (workFrom) work += diffMin(workFrom, e.at);
      workFrom = null;
      pauseFrom = e.at;
    } else if (e.type === "STOP") {
      if (workFrom) work += diffMin(workFrom, e.at);
      workFrom = null;
      pauseFrom = null;
    }
  }
  if (workFrom) work += diffMin(workFrom, now);
  if (pauseFrom) brk += diffMin(pauseFrom, now);
  return { work, brk };
}

/** Rebuilds the derived fields (totals, status, late / early flags) for a day. */
export async function recomputeDay(attendanceId: number, schedule: WorkSchedule | null) {
  const day = await prisma.attendanceDay.findUniqueOrThrow({
    where: { id: attendanceId },
    include: { events: { orderBy: { at: "asc" } } },
  });
  const { events } = day;
  const state = stateFromEvents(events);
  const { work, brk } = totals(events);

  const firstStart = events.find((e) => e.type === "START")?.at ?? null;
  const lastStop = state === "STOPPED" ? events[events.length - 1].at : null;

  const required = schedule?.requiredMinutes ?? DEFAULT_REQUIRED;
  const half = schedule?.halfDayMinutes ?? DEFAULT_HALF;

  let status: AttendanceStatus = "IN_PROGRESS";
  if (state === "STOPPED") status = work >= required ? "PRESENT" : work >= half ? "HALF_DAY" : "ABSENT";

  let isLate = false, lateMinutes = 0, isEarlyCheckout = false, earlyMinutes = 0;
  const isWorkingDay = !schedule || (schedule.workingDays as number[]).includes(day.date.getUTCDay());
  if (schedule && isWorkingDay) {
    if (firstStart) {
      lateMinutes = Math.max(0, minuteOfDay(firstStart) - toMin(schedule.startTime));
      isLate = lateMinutes > schedule.lateGraceMinutes;
      if (!isLate) lateMinutes = 0;
    }
    if (lastStop) {
      earlyMinutes = Math.max(0, toMin(schedule.endTime) - minuteOfDay(lastStop));
      isEarlyCheckout = earlyMinutes > schedule.earlyGraceMinutes;
      if (!isEarlyCheckout) earlyMinutes = 0;
    }
  }

  return prisma.attendanceDay.update({
    where: { id: attendanceId },
    data: {
      firstStartAt: firstStart,
      lastStopAt: lastStop,
      totalWorkMinutes: work,
      totalBreakMinutes: brk,
      status,
      isLate,
      lateMinutes,
      isEarlyCheckout,
      earlyMinutes,
    },
    include: { events: { orderBy: { at: "asc" } } },
  });
}
