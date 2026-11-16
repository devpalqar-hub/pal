import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody, parseId } from "@/lib/http";
import { badRequest, conflict, forbidden, notFound } from "@/lib/auth";
import { meetingUpdateSchema } from "@/lib/validation";
import { notify } from "@/lib/notify";
import { findConflicts, istLabel, meetingInclude } from "@/lib/meetings";

type P = { id: string };
const seesAll = (r: string) => r === "SUPER_ADMIN" || r === "COMPANY_HEAD";

export const GET = authed<P>(async (_req, actor, { id }) => {
  const mid = parseId(id);
  if (!mid) return badRequest("Invalid id");
  const meeting = await prisma.meeting.findUnique({ where: { id: mid }, include: meetingInclude });
  if (!meeting) return notFound("Meeting not found");
  if (!seesAll(actor.role) && meeting.organizerId !== actor.id && !meeting.attendees.some((a) => a.userId === actor.id)) return forbidden();
  return NextResponse.json({ meeting });
});

/** Edit (organiser, or SUPER_ADMIN / COMPANY_HEAD). Invitees are told when the time, link or place changes. */
export const PATCH = authed<P>(async (req, actor, { id }) => {
  const mid = parseId(id);
  if (!mid) return badRequest("Invalid id");
  const m = await prisma.meeting.findUnique({ where: { id: mid }, include: { attendees: true } });
  if (!m) return notFound("Meeting not found");
  if (m.organizerId !== actor.id && !seesAll(actor.role)) return forbidden();
  if (m.status === "CANCELLED") return conflict("This meeting was cancelled");

  const body = await parseBody(req, meetingUpdateSchema);
  if ("error" in body) return body.error;
  const { attendeeIds, startsAt, endsAt, ...rest } = body.data;
  const start = startsAt ? new Date(startsAt) : m.startsAt;
  const end = endsAt ? new Date(endsAt) : m.endsAt;
  if (end <= start) return badRequest("End time must be after the start time");

  const current = m.attendees.map((a) => a.userId);
  const next = attendeeIds ? [...new Set(attendeeIds)].filter((u) => u !== m.organizerId) : current;
  const added = next.filter((u) => !current.includes(u));
  const removed = current.filter((u) => !next.includes(u));
  if (added.length) {
    const found = await prisma.user.count({ where: { id: { in: added }, isActive: true } });
    if (found !== added.length) return badRequest("One or more invitees were not found");
  }
  const timeChanged = start.getTime() !== m.startsAt.getTime() || end.getTime() !== m.endsAt.getTime();
  const detailsChanged = timeChanged || (rest.link !== undefined && rest.link !== m.link) || (rest.location !== undefined && rest.location !== m.location);
  const conflicts = timeChanged || added.length ? await findConflicts([m.organizerId, ...next], start, end, m.id) : [];

  const meeting = await prisma.meeting.update({
    where: { id: mid },
    data: {
      ...rest, startsAt: start, endsAt: end,
      attendees: {
        deleteMany: removed.length ? { userId: { in: removed } } : undefined,
        create: added.map((userId) => ({ userId })),
        // a changed time re-opens everyone's RSVP
        ...(timeChanged ? { updateMany: { where: { userId: { in: next.filter((u) => !added.includes(u)) } }, data: { response: "INVITED", respondedAt: null } } } : {}),
      },
    },
    include: meetingInclude,
  });
  for (const userId of added) await notify({ userId, type: "MEETING_INVITE", title: `Meeting: ${meeting.title}`, body: `${actor.name} invited you — ${istLabel(start)}.`, link: `/meetings?open=${mid}` });
  if (detailsChanged) {
    for (const userId of next.filter((u) => !added.includes(u) && u !== actor.id)) {
      await notify({ userId, type: "MEETING_UPDATED", title: `Meeting updated: ${meeting.title}`, body: `${actor.name} changed the details — now ${istLabel(start)}.`, link: `/meetings?open=${mid}` });
    }
  }
  for (const userId of removed) await notify({ userId, type: "MEETING_CANCELLED", title: `Removed from meeting: ${meeting.title}`, body: `${actor.name} removed you from this meeting.`, link: "/meetings" });
  return NextResponse.json({ meeting, conflicts });
});
