import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody } from "@/lib/http";
import { conflict } from "@/lib/auth";
import { leadStageSchema } from "@/lib/validation";
import { notify } from "@/lib/notify";
import { changeStage, leadCtx } from "@/lib/leads";

/** Move the lead along the pipeline (any stage → any stage; LOST needs a reason). Closing cancels open follow-ups. */
export const POST = authed<{ id: string }>(async (req, actor, { id }) => {
  const ctx = await leadCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const body = await parseBody(req, leadStageSchema);
  if ("error" in body) return body.error;
  const { stage, note, lostReason } = body.data;
  if (!(await changeStage(ctx.lead, stage, actor.id, note, lostReason))) return conflict(`Lead is already ${stage}`);

  if (stage === "WON" || stage === "LOST") {
    const open = await prisma.leadFollowUp.findMany({ where: { leadId: ctx.lead.id, status: "PENDING" }, select: { id: true } });
    if (open.length) {
      await prisma.leadFollowUp.updateMany({ where: { id: { in: open.map((f) => f.id) } }, data: { status: "CANCELLED", outcome: `Lead ${stage.toLowerCase()}` } });
      await prisma.leadActivity.create({ data: { leadId: ctx.lead.id, actorId: actor.id, type: "FOLLOW_UP_CANCELLED", note: `${open.length} open follow-up(s) closed — lead ${stage.toLowerCase()}` } });
    }
    await prisma.lead.update({ where: { id: ctx.lead.id }, data: { nextFollowUpAt: null } });
  }
  if (ctx.lead.ownerId !== actor.id && (stage === "WON" || stage === "LOST")) {
    await notify({ userId: ctx.lead.ownerId, type: "LEAD_ASSIGNED", title: `${ctx.lead.name} marked ${stage.toLowerCase()}`, body: `${actor.name} closed this lead.${lostReason ? ` “${lostReason}”` : ""}`, link: `/leads/${ctx.lead.id}` });
  }
  return NextResponse.json({ lead: await prisma.lead.findUnique({ where: { id: ctx.lead.id } }) });
});
