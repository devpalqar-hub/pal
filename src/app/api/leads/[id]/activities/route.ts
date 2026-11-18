import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody } from "@/lib/http";
import { badRequest } from "@/lib/auth";
import { leadActivitySchema } from "@/lib/validation";
import { leadCtx, touchLead } from "@/lib/leads";
import { scheduleFollowUp } from "@/lib/follow-ups";

/** Log a touch-point (note, call, email, WhatsApp) and optionally book the next follow-up in the same step. */
export const POST = authed<{ id: string }>(async (req, actor, { id }) => {
  const ctx = await leadCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const body = await parseBody(req, leadActivitySchema);
  if ("error" in body) return body.error;
  const { type, note, nextFollowUp } = body.data;
  const act = await prisma.leadActivity.create({ data: { leadId: ctx.lead.id, actorId: actor.id, type, note } });
  // first real contact moves a brand-new lead to CONTACTED
  if (type !== "NOTE" && ctx.lead.stage === "NEW") {
    await prisma.$transaction([
      prisma.lead.update({ where: { id: ctx.lead.id }, data: { stage: "CONTACTED" } }),
      prisma.leadActivity.create({ data: { leadId: ctx.lead.id, actorId: actor.id, type: "STAGE_CHANGED", fromValue: "NEW", toValue: "CONTACTED", note: "First contact logged" } }),
    ]);
  }
  if (nextFollowUp) {
    const r = await scheduleFollowUp(ctx.lead, nextFollowUp, actor);
    if ("error" in r) return badRequest(r.error);
  } else await touchLead(ctx.lead.id);
  return NextResponse.json({ activity: act }, { status: 201 });
});
