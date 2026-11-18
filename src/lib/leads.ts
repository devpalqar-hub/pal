import type { Lead, LeadActivityType, LeadStage, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { notFound, type AuthUser } from "./auth";
import { rank } from "./roles";

/** The pipeline, in order. WON and LOST close the lead. */
export const STAGES: LeadStage[] = ["NEW", "CONTACTED", "MQL", "SQL", "DEMO_SCHEDULED", "DEMO_DONE", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];
export const OPEN_STAGES = STAGES.filter((s) => s !== "WON" && s !== "LOST");
export const stageIndex = (s: LeadStage) => STAGES.indexOf(s);

/** MANAGER and above see and manage every lead; everyone else sees leads they own, created or have a follow-up on. */
export const seesAllLeads = (r: AuthUser["role"]) => rank(r) >= rank("MANAGER");

export function leadScope(actor: AuthUser): Prisma.LeadWhereInput {
  if (seesAllLeads(actor.role)) return {};
  return { OR: [{ ownerId: actor.id }, { createdById: actor.id }, { followUps: { some: { assigneeId: actor.id } } }, { meetings: { some: { OR: [{ organizerId: actor.id }, { attendees: { some: { userId: actor.id } } }] } } }] };
}

export const leadListInclude = {
  owner: { select: { id: true, name: true, role: true } },
  _count: { select: { followUps: { where: { status: "PENDING" } }, meetings: true } },
} satisfies Prisma.LeadInclude;

/** Loads a lead the caller can see. `canManage`: edit details, reassign, delete. Anyone who can see it can work it (log, follow up, move stage). */
export async function leadCtx(idParam: string, actor: AuthUser): Promise<{ error: Response } | { lead: Lead; canManage: boolean }> {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id < 1) return { error: NextResponse.json({ error: "Invalid id" }, { status: 400 }) };
  const lead = await prisma.lead.findFirst({ where: { id, ...leadScope(actor) } });
  if (!lead) return { error: notFound("Lead not found") };
  const canManage = seesAllLeads(actor.role) || lead.ownerId === actor.id || lead.createdById === actor.id;
  return { lead, canManage };
}

export function activity(leadId: number, actorId: number, type: LeadActivityType, extra: { fromValue?: string | null; toValue?: string | null; note?: string | null; meetingId?: number } = {}) {
  return prisma.leadActivity.create({ data: { leadId, actorId, type, ...extra } });
}

/** Re-derives the denormalised "next follow-up" and bumps last activity. */
export async function touchLead(leadId: number) {
  const next = await prisma.leadFollowUp.findFirst({ where: { leadId, status: "PENDING" }, orderBy: { dueAt: "asc" }, select: { dueAt: true } });
  await prisma.lead.update({ where: { id: leadId }, data: { nextFollowUpAt: next?.dueAt ?? null, lastActivityAt: new Date() } });
}

/** Moves a lead to a stage, stamping won / lost dates and the journey log. */
export async function changeStage(lead: { id: number; stage: LeadStage }, to: LeadStage, actorId: number, note?: string | null, lostReason?: string | null) {
  if (lead.stage === to) return false;
  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: {
        stage: to,
        wonAt: to === "WON" ? new Date() : null,
        lostAt: to === "LOST" ? new Date() : null,
        lostReason: to === "LOST" ? lostReason ?? null : null,
        lastActivityAt: new Date(),
      },
    }),
    prisma.leadActivity.create({ data: { leadId: lead.id, actorId, type: "STAGE_CHANGED", fromValue: lead.stage, toValue: to, note: to === "LOST" ? lostReason ?? note ?? null : note ?? null } }),
  ]);
  return true;
}

/** Active user check for owner / follow-up assignee pickers. */
export async function activeUser(id: number) {
  return prisma.user.findFirst({ where: { id, isActive: true }, select: { id: true, name: true } });
}
