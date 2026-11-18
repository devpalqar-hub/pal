import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authed, parseBody } from "@/lib/http";
import { badRequest } from "@/lib/auth";
import { meetingSchema } from "@/lib/validation";
import { notify } from "@/lib/notify";
import { findConflicts, istLabel, meetingInclude } from "@/lib/meetings";
import { syncMeeting } from "@/lib/meeting-sync";
import { activity, changeStage, leadScope, stageIndex, touchLead } from "@/lib/leads";

/** ?scope=upcoming (default) | past | all   ?from= ?to= (ISO)   ?projectId=  ?leadId=   Meetings I organise or am invited to. */
export const GET = authed(async (req, actor) => {
  const q = new URL(req.url).searchParams;
  const now = new Date();
  const where: Prisma.MeetingWhereInput = { OR: [{ organizerId: actor.id }, { attendees: { some: { userId: actor.id } } }] };
  const scope = q.get("scope") ?? "upcoming";
  if (scope === "upcoming") where.endsAt = { gte: now };
  if (scope === "past") where.endsAt = { lt: now };
  if (q.get("from")) where.startsAt = { ...(where.startsAt as object), gte: new Date(q.get("from")!) };
  if (q.get("to")) where.startsAt = { ...(where.startsAt as object), lt: new Date(q.get("to")!) };
  if (q.get("projectId")) where.projectId = Number(q.get("projectId"));
  if (q.get("leadId")) where.leadId = Number(q.get("leadId"));

  const meetings = await prisma.meeting.findMany({ where, include: meetingInclude, orderBy: { startsAt: scope === "past" ? "desc" : "asc" }, take: 200 });
  return NextResponse.json({ meetings });
});

/**
 * Schedule a meeting. PAL invitees are notified in-app; external guests are invited by email (no account is created).
 * With Google Calendar connected the event is created in the organiser's calendar (with a Meet link when none is given).
 */
export const POST = authed(async (req, actor) => {
  const body = await parseBody(req, meetingSchema);
  if ("error" in body) return body.error;
  const { attendeeIds, guests, startsAt, endsAt, projectId, leadId, isDemo, syncGoogle, ...rest } = body.data;

  if (projectId && !(await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }))) return badRequest("Project not found");
  const lead = leadId ? await prisma.lead.findFirst({ where: { id: leadId, ...leadScope(actor) }, select: { id: true, stage: true, name: true } }) : null;
  if (leadId && !lead) return badRequest("Lead not found");
  const ids = [...new Set(attendeeIds)].filter((id) => id !== actor.id);
  const users = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } });
  if (users.length !== ids.length) return badRequest("One or more invitees were not found");
  const guestList = [...new Map(guests.map((g) => [g.email, g])).values()];

  const start = new Date(startsAt), end = new Date(endsAt);
  const conflicts = await findConflicts([actor.id, ...ids], start, end);

  const created = await prisma.meeting.create({
    data: {
      ...rest, startsAt: start, endsAt: end, projectId: projectId ?? null, leadId: lead?.id ?? null, organizerId: actor.id,
      attendees: { create: ids.map((userId) => ({ userId })) },
      guests: { create: guestList.map((g) => ({ email: g.email, name: g.name ?? null })) },
    },
  });
  for (const userId of ids) {
    await notify({ userId, type: "MEETING_INVITE", title: `Meeting: ${created.title}`, body: `${actor.name} invited you — ${istLabel(start)}.${lead ? ` Lead: ${lead.name}.` : ""}`, link: `/meetings?open=${created.id}` });
  }
  if (lead) {
    await activity(lead.id, actor.id, "MEETING_SCHEDULED", { meetingId: created.id, note: `${created.title} — ${istLabel(start)}` });
    if (isDemo && stageIndex(lead.stage) < stageIndex("DEMO_SCHEDULED")) await changeStage(lead, "DEMO_SCHEDULED", actor.id, "Demo meeting scheduled");
    await touchLead(lead.id);
  }
  const calendar = await syncMeeting(created.id, { useGoogle: syncGoogle, emailGuests: "all" });
  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: created.id }, include: meetingInclude });
  return NextResponse.json({ meeting, conflicts, calendar }, { status: 201 });
});
