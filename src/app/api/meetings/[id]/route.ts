import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody, parseId } from "@/lib/http";
import { badRequest, conflict, forbidden, notFound } from "@/lib/auth";
import { meetingUpdateSchema } from "@/lib/validation";
import { notify } from "@/lib/notify";
import { findConflicts, istLabel, meetingInclude } from "@/lib/meetings";
import { cancelMeetingExternally, emailRemovedGuests, syncMeeting } from "@/lib/meeting-sync";
import { activity, leadScope } from "@/lib/leads";

type P = { id: string };
const seesAll = (r: string) => r === "SUPER_ADMIN" || r === "COMPANY_HEAD";

export const GET = authed<P>(async (_req, actor, { id }) => {
  const mid = parseId(id);
  if (!mid) return badRequest("Invalid id");
  const meeting = await prisma.meeting.findUnique({ where: { id: mid }, include: meetingInclude });
  if (!meeting) return notFound("Meeting not found");
  const involved = meeting.organizerId === actor.id || meeting.attendees.some((a) => a.userId === actor.id);
  const viaLead = !involved && meeting.leadId ? !!(await prisma.lead.findFirst({ where: { id: meeting.leadId, ...leadScope(actor) }, select: { id: true } })) : false;
  if (!seesAll(actor.role) && !involved && !viaLead) return forbidden();
  const google = meeting.googleEventId ? { htmlLink: meeting.organizerId === actor.id ? meeting.googleHtmlLink : null } : null;
  return NextResponse.json({ meeting: { ...meeting, google } });
});

/** Edit (organiser, or SUPER_ADMIN / COMPANY_HEAD). Invitees and guests are told when the time, link or place changes. */
export const PATCH = authed<P>(async (req, actor, { id }) => {
  const mid = parseId(id);
  if (!mid) return badRequest("Invalid id");
  const m = await prisma.meeting.findUnique({ where: { id: mid }, include: { attendees: true, guests: true } });
  if (!m) return notFound("Meeting not found");
  if (m.organizerId !== actor.id && !seesAll(actor.role)) return forbidden();
  if (m.status === "CANCELLED") return conflict("This meeting was cancelled");

  const body = await parseBody(req, meetingUpdateSchema);
  if ("error" in body) return body.error;
  const { attendeeIds, guests, startsAt, endsAt, leadId, ...rest } = body.data;
  const start = startsAt ? new Date(startsAt) : m.startsAt;
  const end = endsAt ? new Date(endsAt) : m.endsAt;
  if (end <= start) return badRequest("End time must be after the start time");
  if (leadId && !(await prisma.lead.findFirst({ where: { id: leadId, ...leadScope(actor) }, select: { id: true } }))) return badRequest("Lead not found");

  const current = m.attendees.map((a) => a.userId);
  const next = attendeeIds ? [...new Set(attendeeIds)].filter((u) => u !== m.organizerId) : current;
  const added = next.filter((u) => !current.includes(u));
  const removed = current.filter((u) => !next.includes(u));
  if (added.length) {
    const found = await prisma.user.count({ where: { id: { in: added }, isActive: true } });
    if (found !== added.length) return badRequest("One or more invitees were not found");
  }
  const curGuests = m.guests.map((g) => g.email);
  const nextGuests = guests ? [...new Map(guests.map((g) => [g.email, g])).values()] : null;
  const addedGuests = nextGuests ? nextGuests.filter((g) => !curGuests.includes(g.email)) : [];
  const removedGuests = nextGuests ? curGuests.filter((e) => !nextGuests.some((g) => g.email === e)) : [];

  const timeChanged = start.getTime() !== m.startsAt.getTime() || end.getTime() !== m.endsAt.getTime();
  const detailsChanged = timeChanged || (rest.link !== undefined && rest.link !== m.link) || (rest.location !== undefined && rest.location !== m.location) || (rest.title !== undefined && rest.title !== m.title);
  const conflicts = timeChanged || added.length ? await findConflicts([m.organizerId, ...next], start, end, m.id) : [];

  await prisma.meeting.update({
    where: { id: mid },
    data: {
      ...rest, startsAt: start, endsAt: end,
      ...(leadId !== undefined && { leadId }),
      // a new time means a new "starts in 5 minutes" reminder
      ...(timeChanged && { reminderSentAt: null }),
      attendees: {
        deleteMany: removed.length ? { userId: { in: removed } } : undefined,
        create: added.map((userId) => ({ userId })),
        // a changed time re-opens everyone's RSVP
        ...(timeChanged ? { updateMany: { where: { userId: { in: next.filter((u) => !added.includes(u)) } }, data: { response: "INVITED", respondedAt: null } } } : {}),
      },
      ...(nextGuests && {
        guests: {
          deleteMany: removedGuests.length ? { email: { in: removedGuests } } : undefined,
          create: addedGuests.map((g) => ({ email: g.email, name: g.name ?? null })),
        },
      }),
    },
  });
  for (const userId of added) await notify({ userId, type: "MEETING_INVITE", title: `Meeting: ${rest.title ?? m.title}`, body: `${actor.name} invited you — ${istLabel(start)}.`, link: `/meetings?open=${mid}` });
  if (detailsChanged) {
    for (const userId of next.filter((u) => !added.includes(u) && u !== actor.id)) {
      await notify({ userId, type: "MEETING_UPDATED", title: `Meeting updated: ${rest.title ?? m.title}`, body: `${actor.name} changed the details — now ${istLabel(start)}.`, link: `/meetings?open=${mid}` });
    }
  }
  for (const userId of removed) await notify({ userId, type: "MEETING_CANCELLED", title: `Removed from meeting: ${m.title}`, body: `${actor.name} removed you from this meeting.`, link: "/meetings" });

  await emailRemovedGuests(mid, removedGuests);
  const needsSync = detailsChanged || added.length || removed.length || addedGuests.length || removedGuests.length || rest.agenda !== undefined;
  const calendar = needsSync
    ? await syncMeeting(mid, { useGoogle: !!m.googleEventId, emailGuests: detailsChanged ? "all" : addedGuests.map((g) => g.email) })
    : null;
  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: mid }, include: meetingInclude });
  return NextResponse.json({ meeting, conflicts, calendar });
});

/**
 * Delete a meeting for good (organiser, or SUPER_ADMIN / COMPANY_HEAD).
 * If it was still coming up, everyone is told it is cancelled first — PAL invitees in-app, guests by email,
 * and the Google Calendar event is removed (Google notifies its attendees).
 */
export const DELETE = authed<P>(async (_req, actor, { id }) => {
  const mid = parseId(id);
  if (!mid) return badRequest("Invalid id");
  const m = await prisma.meeting.findUnique({ where: { id: mid }, include: { attendees: true } });
  if (!m) return notFound("Meeting not found");
  if (m.organizerId !== actor.id && !seesAll(actor.role)) return forbidden();

  const upcoming = m.status === "SCHEDULED" && m.endsAt > new Date();
  if (upcoming || m.googleEventId) await cancelMeetingExternally(mid);
  if (upcoming) {
    for (const a of m.attendees.filter((a) => a.userId !== actor.id && a.response !== "DECLINED")) {
      await notify({ userId: a.userId, type: "MEETING_CANCELLED", title: `Cancelled: ${m.title}`, body: `${actor.name} deleted the meeting planned for ${istLabel(m.startsAt)}.`, link: "/meetings" });
    }
    if (m.leadId) await activity(m.leadId, actor.id, "MEETING_CANCELLED", { meetingId: mid, note: `${m.title} — deleted` });
  }
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { link: `/meetings?open=${mid}` } }),
    prisma.meeting.delete({ where: { id: mid } }),
  ]);
  return NextResponse.json({ ok: true });
});
