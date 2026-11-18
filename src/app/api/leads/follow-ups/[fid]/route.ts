import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody, parseId } from "@/lib/http";
import { badRequest, conflict, forbidden, notFound } from "@/lib/auth";
import { followUpActionSchema } from "@/lib/validation";
import { istLabel } from "@/lib/meetings";
import { leadCtx, touchLead } from "@/lib/leads";
import { scheduleFollowUp } from "@/lib/follow-ups";

/** Complete (with outcome + optional next follow-up), cancel or reschedule. Assignee, or anyone managing the lead. */
export const PATCH = authed<{ fid: string }>(async (req, actor, { fid }) => {
  const id = parseId(fid);
  if (!id) return badRequest("Invalid id");
  const f = await prisma.leadFollowUp.findUnique({ where: { id } });
  if (!f) return notFound("Follow-up not found");
  const ctx = await leadCtx(String(f.leadId), actor);
  if ("error" in ctx) return ctx.error;
  if (f.assigneeId !== actor.id && !ctx.canManage) return forbidden();
  if (f.status !== "PENDING") return conflict(`This follow-up is already ${f.status.toLowerCase()}`);

  const body = await parseBody(req, followUpActionSchema);
  if ("error" in body) return body.error;
  const b = body.data;
  if (b.action === "done") {
    await prisma.$transaction([
      prisma.leadFollowUp.update({ where: { id }, data: { status: "DONE", doneAt: new Date(), outcome: b.outcome ?? null } }),
      prisma.leadActivity.create({ data: { leadId: f.leadId, actorId: actor.id, type: "FOLLOW_UP_DONE", toValue: f.type, note: b.outcome ?? f.note ?? null } }),
    ]);
    if (b.nextFollowUp) {
      const r = await scheduleFollowUp(ctx.lead, b.nextFollowUp, actor);
      if ("error" in r) return badRequest(r.error);
    }
  } else if (b.action === "cancel") {
    await prisma.$transaction([
      prisma.leadFollowUp.update({ where: { id }, data: { status: "CANCELLED", outcome: b.reason ?? null } }),
      prisma.leadActivity.create({ data: { leadId: f.leadId, actorId: actor.id, type: "FOLLOW_UP_CANCELLED", toValue: f.type, note: b.reason ?? null } }),
    ]);
  } else {
    const dueAt = new Date(b.dueAt);
    await prisma.$transaction([
      prisma.leadFollowUp.update({ where: { id }, data: { dueAt, reminderSentAt: null, ...(b.note && { note: b.note }) } }),
      prisma.leadActivity.create({ data: { leadId: f.leadId, actorId: actor.id, type: "FOLLOW_UP_SCHEDULED", fromValue: f.dueAt.toISOString(), toValue: dueAt.toISOString(), note: `Rescheduled to ${istLabel(dueAt)}${b.note ? ` — ${b.note}` : ""}` } }),
    ]);
  }
  await touchLead(f.leadId);
  return NextResponse.json({ followUp: await prisma.leadFollowUp.findUnique({ where: { id } }) });
});
