import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export const meetingInclude = {
  organizer: { select: { id: true, name: true, role: true, designation: true } },
  project: { select: { id: true, name: true } },
  attendees: { include: { user: { select: { id: true, name: true, role: true, designation: true } } }, orderBy: { id: "asc" } },
  guests: { orderBy: { id: "asc" } },
  lead: { select: { id: true, name: true, company: true, stage: true } },
} satisfies Prisma.MeetingInclude;

/** Meetings in [start, end) that already include any of these people (excluding `ignoreId`). */
export async function findConflicts(userIds: number[], start: Date, end: Date, ignoreId?: number) {
  if (!userIds.length) return [];
  const clashes = await prisma.meeting.findMany({
    where: {
      status: "SCHEDULED",
      id: ignoreId ? { not: ignoreId } : undefined,
      startsAt: { lt: end },
      endsAt: { gt: start },
      OR: [{ organizerId: { in: userIds } }, { attendees: { some: { userId: { in: userIds }, response: { not: "DECLINED" } } } }],
    },
    select: { id: true, title: true, startsAt: true, endsAt: true, organizerId: true, attendees: { select: { userId: true } } },
  });
  return clashes.map((m) => ({
    meetingId: m.id,
    title: m.title,
    startsAt: m.startsAt,
    endsAt: m.endsAt,
    users: userIds.filter((u) => u === m.organizerId || m.attendees.some((a) => a.userId === u)),
  }));
}

export const istLabel = (d: Date) =>
  d.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) + " IST";
