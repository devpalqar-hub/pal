import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody, parseId } from "@/lib/http";
import { badRequest, conflict, forbidden, notFound } from "@/lib/auth";
import { rsvpSchema } from "@/lib/validation";
import { meetingInclude } from "@/lib/meetings";

/** Invitee RSVP: ACCEPTED / DECLINED / TENTATIVE */
export const POST = authed<{ id: string }>(async (req, actor, { id }) => {
  const mid = parseId(id);
  if (!mid) return badRequest("Invalid id");
  const m = await prisma.meeting.findUnique({ where: { id: mid }, select: { status: true } });
  if (!m) return notFound("Meeting not found");
  if (m.status === "CANCELLED") return conflict("This meeting was cancelled");
  const body = await parseBody(req, rsvpSchema);
  if ("error" in body) return body.error;
  const res = await prisma.meetingAttendee.updateMany({ where: { meetingId: mid, userId: actor.id }, data: { response: body.data.response, respondedAt: new Date() } });
  if (!res.count) return forbidden();
  return NextResponse.json({ meeting: await prisma.meeting.findUnique({ where: { id: mid }, include: meetingInclude }) });
});
