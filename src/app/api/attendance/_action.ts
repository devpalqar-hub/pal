import { NextResponse } from "next/server";
import type { WorkEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/http";
import { enforceShiftEnd, pauseTaskTimers } from "@/lib/day-timer";
import { dateKey, recomputeDay, stateFromEvents, type WorkState } from "@/lib/attendance";

/** Builds a POST handler for start / pause / resume / stop, enforcing valid state transitions. */
export function workAction(type: WorkEventType, allowedFrom: WorkState[]) {
  return authed(async (_req, user) => {
    await enforceShiftEnd(user.id);
    const date = dateKey();
    let day = await prisma.attendanceDay.findUnique({
      where: { userId_date: { userId: user.id, date } },
      include: { events: { orderBy: { at: "asc" } } },
    });
    const state = stateFromEvents(day?.events ?? []);
    if (!allowedFrom.includes(state)) {
      return NextResponse.json({ error: `Cannot ${type.toLowerCase()} while ${state}` }, { status: 409 });
    }
    day ??= await prisma.attendanceDay.create({
      data: { userId: user.id, date },
      include: { events: { orderBy: { at: "asc" } } },
    });
    await prisma.workEvent.create({ data: { attendanceId: day.id, type } });
    // The day timer is the master timer: pausing or ending the day pauses every running task timer.
    if (type === "PAUSE" || type === "STOP") {
      await pauseTaskTimers(user.id, new Date(), type === "PAUSE" ? "Auto-paused: day timer paused" : "Auto-paused: day ended");
    }
    const schedule = await prisma.workSchedule.findUnique({ where: { userId: user.id } });
    const updated = await recomputeDay(day.id, schedule);
    return NextResponse.json({ state: stateFromEvents(updated.events), attendance: updated });
  });
}
