import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody } from "@/lib/http";
import { conflict } from "@/lib/auth";
import { leadTempSchema } from "@/lib/validation";
import { leadCtx } from "@/lib/leads";

/** Mark the lead HOT / WARM / COLD. */
export const POST = authed<{ id: string }>(async (req, actor, { id }) => {
  const ctx = await leadCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const body = await parseBody(req, leadTempSchema);
  if ("error" in body) return body.error;
  const { temperature, note } = body.data;
  if (ctx.lead.temperature === temperature) return conflict(`Lead is already ${temperature}`);
  const [lead] = await prisma.$transaction([
    prisma.lead.update({ where: { id: ctx.lead.id }, data: { temperature, lastActivityAt: new Date() } }),
    prisma.leadActivity.create({ data: { leadId: ctx.lead.id, actorId: actor.id, type: "TEMPERATURE_CHANGED", fromValue: ctx.lead.temperature, toValue: temperature, note: note ?? null } }),
  ]);
  return NextResponse.json({ lead });
});
