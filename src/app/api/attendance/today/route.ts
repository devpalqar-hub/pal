import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/http";
import { enforceShiftEnd } from "@/lib/day-timer";
import { dateKey, recomputeDay, stateFromEvents } from "@/lib/attendance";

export const GET = authed(async (_req, user) => {
  await enforceShiftEnd(user.id);
  const day = await prisma.attendanceDay.findUnique({
    where: { userId_date: { userId: user.id, date: dateKey() } },
  });
  if (!day) return NextResponse.json({ state: "NOT_STARTED", attendance: null });
  const schedule = await prisma.workSchedule.findUnique({ where: { userId: user.id } });
  const fresh = await recomputeDay(day.id, schedule); // refreshes running totals
  return NextResponse.json({ state: stateFromEvents(fresh.events), attendance: fresh });
});
