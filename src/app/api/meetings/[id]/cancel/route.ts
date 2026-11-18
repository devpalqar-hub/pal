import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authed, parseBody, parseId } from "@/lib/http";
import { badRequest, conflict, forbidden, notFound } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { istLabel, meetingInclude } from "@/lib/meetings";
import { cancelMeetingExternally } from "@/lib/meeting-sync";
import { activity } from "@/lib/leads";

export const POST = authed<{ id: string }>(async (req, actor, { id }) => {
  const mid = parseId(id);
  if (!mid) return badRequest("Invalid id");
  const m = await prisma.meeting.findUnique({ where: { id: mid }, include: { attendees: true } });
  if (!m) return notFound("Meeting not found");
  if (m.organizerId !== actor.id && actor.role !== "SUPER_ADMIN" && actor.role !== "COMPANY_HEAD") return forbidden();
  if (m.status === "CANCELLED") return conflict("Already cancelled");

  const body = await parseBody(req, z.object({ reason: z.string().trim().max(500).optional() }));
  if ("error" in body) return body.error;
  const meeting = await prisma.meeting.update({ where: { id: mid }, data: { status: "CANCELLED" }, include: meetingInclude });
  for (const a of m.attendees.filter((a) => a.userId !== actor.id)) {
    await notify({ userId: a.userId, type: "MEETING_CANCELLED", title: `Cancelled: ${m.title}`, body: `${actor.name} cancelled the meeting planned for ${istLabel(m.startsAt)}.${body.data.reason ? ` “${body.data.reason}”` : ""}`, link: `/meetings?open=${mid}` });
  }
  await cancelMeetingExternally(mid);
  if (m.leadId) await activity(m.leadId, actor.id, "MEETING_CANCELLED", { meetingId: mid, note: `${m.title}${body.data.reason ? ` — ${body.data.reason}` : ""}` });
  return NextResponse.json({ meeting });
});
