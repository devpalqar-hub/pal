import { NextResponse } from "next/server";
import type { LeadSource, LeadStage, LeadTemperature, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authed, parseBody } from "@/lib/http";
import { badRequest } from "@/lib/auth";
import { createLeadSchema } from "@/lib/validation";
import { notify } from "@/lib/notify";
import { istDateKey } from "@/lib/time";
import { OPEN_STAGES, activeUser, leadListInclude, leadScope, seesAllLeads, touchLead } from "@/lib/leads";

const DAY = 86_400_000;

/**
 * Leads the caller can see, plus pipeline numbers.
 * ?q= ?stage= ?temperature= ?source= ?ownerId= (or "me") ?followUp=overdue|today|none ?status=open|won|lost|all
 */
export const GET = authed(async (req, actor) => {
  const q = new URL(req.url).searchParams;
  const scope = leadScope(actor);
  const now = new Date();
  const dayStart = new Date(istDateKey().getTime() - 330 * 60_000); // IST midnight as an instant
  const dayEnd = new Date(dayStart.getTime() + DAY);
  const and: Prisma.LeadWhereInput[] = [scope];
  const text = q.get("q")?.trim();
  if (text) and.push({ OR: [{ name: { contains: text } }, { company: { contains: text } }, { email: { contains: text } }, { phone: { contains: text } }, { tags: { contains: text } }] });
  if (q.get("stage")) and.push({ stage: q.get("stage") as LeadStage });
  if (q.get("temperature")) and.push({ temperature: q.get("temperature") as LeadTemperature });
  if (q.get("source")) and.push({ source: q.get("source") as LeadSource });
  const owner = q.get("ownerId");
  if (owner) and.push({ ownerId: owner === "me" ? actor.id : Number(owner) });
  const status = q.get("status") ?? "all";
  if (status === "open") and.push({ stage: { in: OPEN_STAGES } });
  if (status === "won") and.push({ stage: "WON" });
  if (status === "lost") and.push({ stage: "LOST" });
  const fu = q.get("followUp");
  if (fu === "overdue") and.push({ nextFollowUpAt: { lt: now } });
  if (fu === "today") and.push({ nextFollowUpAt: { gte: dayStart, lt: dayEnd } });
  if (fu === "none") and.push({ nextFollowUpAt: null, stage: { in: OPEN_STAGES } });

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [leads, byStage, hot, overdue, today, wonMonth, value] = await Promise.all([
    prisma.lead.findMany({ where: { AND: and }, include: leadListInclude, orderBy: [{ updatedAt: "desc" }], take: 500 }),
    prisma.lead.groupBy({ by: ["stage"], where: scope, _count: true, _sum: { value: true } }),
    prisma.lead.count({ where: { AND: [scope, { temperature: "HOT", stage: { in: OPEN_STAGES } }] } }),
    prisma.leadFollowUp.count({ where: { status: "PENDING", dueAt: { lt: now }, ...(seesAllLeads(actor.role) ? {} : { assigneeId: actor.id }) } }),
    prisma.leadFollowUp.count({ where: { status: "PENDING", dueAt: { gte: dayStart, lt: dayEnd }, ...(seesAllLeads(actor.role) ? {} : { assigneeId: actor.id }) } }),
    prisma.lead.count({ where: { AND: [scope, { stage: "WON", wonAt: { gte: monthStart } }] } }),
    prisma.lead.aggregate({ where: { AND: [scope, { stage: { in: OPEN_STAGES } }] }, _sum: { value: true } }),
  ]);
  const stages = Object.fromEntries(byStage.map((g) => [g.stage, { count: g._count, value: Number(g._sum.value ?? 0) }]));
  const won = stages.WON?.count ?? 0, lost = stages.LOST?.count ?? 0;
  return NextResponse.json({
    leads,
    summary: {
      stages,
      open: OPEN_STAGES.reduce((n, s) => n + (stages[s]?.count ?? 0), 0),
      hot,
      followUpsOverdue: overdue,
      followUpsToday: today,
      wonThisMonth: wonMonth,
      pipelineValue: Number(value._sum.value ?? 0),
      winRate: won + lost ? Math.round((won / (won + lost)) * 100) : null,
    },
  });
});

/** Create a lead (anyone). Owner defaults to the creator; an optional first follow-up can be scheduled at once. */
export const POST = authed(async (req, actor) => {
  const body = await parseBody(req, createLeadSchema);
  if ("error" in body) return body.error;
  const { firstFollowUp, ownerId: ownerIn, ...data } = body.data;
  const ownerId = ownerIn ?? actor.id;
  const owner = await activeUser(ownerId);
  if (!owner) return badRequest("Owner not found");
  if (firstFollowUp?.assigneeId && !(await activeUser(firstFollowUp.assigneeId))) return badRequest("Follow-up assignee not found");

  const lead = await prisma.lead.create({
    data: {
      ...data, ownerId, createdById: actor.id,
      ...(data.stage === "WON" && { wonAt: new Date() }),
      ...(data.stage === "LOST" && { lostAt: new Date() }),
      activities: { create: { type: "CREATED", actorId: actor.id, toValue: data.stage, note: `Source: ${data.source.replace("_", " ").toLowerCase()} · ${data.temperature.toLowerCase()}` } },
      ...(firstFollowUp && {
        followUps: { create: { type: firstFollowUp.type, dueAt: new Date(firstFollowUp.dueAt), note: firstFollowUp.note, assigneeId: firstFollowUp.assigneeId ?? ownerId, createdById: actor.id } },
      }),
    },
  });
  if (firstFollowUp) {
    await prisma.leadActivity.create({ data: { leadId: lead.id, actorId: actor.id, type: "FOLLOW_UP_SCHEDULED", toValue: firstFollowUp.dueAt, note: `${firstFollowUp.type.toLowerCase()}${firstFollowUp.note ? ` — ${firstFollowUp.note}` : ""}` } });
    await touchLead(lead.id);
  }
  if (ownerId !== actor.id) await notify({ userId: ownerId, type: "LEAD_ASSIGNED", title: `New lead for you: ${lead.name}${lead.company ? ` (${lead.company})` : ""}`, body: `${actor.name} assigned this lead to you.`, link: `/leads/${lead.id}` });
  const fuAssignee = firstFollowUp ? firstFollowUp.assigneeId ?? ownerId : null;
  if (fuAssignee && fuAssignee !== actor.id && fuAssignee !== ownerId) await notify({ userId: fuAssignee, type: "LEAD_FOLLOW_UP_ASSIGNED", title: `Follow-up: ${lead.name}`, body: `${actor.name} asked you to follow up.`, link: `/leads/${lead.id}` });
  return NextResponse.json({ lead }, { status: 201 });
});
