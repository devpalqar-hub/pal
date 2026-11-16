import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authed, parseBody } from "@/lib/http";
import { badRequest } from "@/lib/auth";
import { meetingSchema } from "@/lib/validation";
import { notify } from "@/lib/notify";
import { findConflicts, istLabel, meetingInclude } from "@/lib/meetings";

/** ?scope=upcoming (default) | past | all   ?from= ?to= (ISO)   ?projectId=   Meetings I organise or am invited to. */
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

  const meetings = await prisma.meeting.findMany({ where, include: meetingInclude, orderBy: { startsAt: scope === "past" ? "desc" : "asc" }, take: 200 });
  return NextResponse.json({ meetings });
});

/** Schedule a meeting. Invitees are notified; overlaps with their other meetings are reported (not blocked). */
export const POST = authed(async (req, actor) => {
  const body = await parseBody(req, meetingSchema);
  if ("error" in body) return body.error;
  const { attendeeIds, startsAt, endsAt, projectId, ...rest } = body.data;

  if (projectId && !(await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }))) return badRequest("Project not found");
  const ids = [...new Set(attendeeIds)].filter((id) => id !== actor.id);
  const users = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } });
  if (users.length !== ids.length) return badRequest("One or more invitees were not found");

  const start = new Date(startsAt), end = new Date(endsAt);
  const conflicts = await findConflicts([actor.id, ...ids], start, end);

  const meeting = await prisma.meeting.create({
    data: {
      ...rest, startsAt: start, endsAt: end, projectId: projectId ?? null, organizerId: actor.id,
      attendees: { create: ids.map((userId) => ({ userId })) },
    },
    include: meetingInclude,
  });
  for (const userId of ids) {
    await notify({ userId, type: "MEETING_INVITE", title: `Meeting: ${meeting.title}`, body: `${actor.name} invited you — ${istLabel(start)}.`, link: `/meetings?open=${meeting.id}` });
  }
  return NextResponse.json({ meeting, conflicts }, { status: 201 });
});
