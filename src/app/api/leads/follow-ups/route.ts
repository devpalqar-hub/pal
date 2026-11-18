import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/http";
import { istDateKey } from "@/lib/time";
import { seesAllLeads } from "@/lib/leads";

const DAY = 86_400_000;

/** Follow-up queue. ?when=overdue|today|upcoming|done (default: all pending)  ?scope=mine (default) | team (MANAGER+) */
export const GET = authed(async (req, actor) => {
  const q = new URL(req.url).searchParams;
  const team = q.get("scope") === "team" && seesAllLeads(actor.role);
  const now = new Date();
  const dayStart = new Date(istDateKey().getTime() - 330 * 60_000);
  const dayEnd = new Date(dayStart.getTime() + DAY);
  const where: Prisma.LeadFollowUpWhereInput = { ...(team ? {} : { assigneeId: actor.id }), status: "PENDING" };
  const when = q.get("when");
  if (when === "overdue") where.dueAt = { lt: now };
  if (when === "today") where.dueAt = { gte: dayStart, lt: dayEnd };
  if (when === "upcoming") where.dueAt = { gte: dayEnd };
  if (when === "done") where.status = "DONE";
  const followUps = await prisma.leadFollowUp.findMany({
    where,
    include: { assignee: { select: { id: true, name: true } }, lead: { select: { id: true, name: true, company: true, phone: true, email: true, stage: true, temperature: true } } },
    orderBy: { dueAt: when === "done" ? "desc" : "asc" },
    take: 300,
  });
  return NextResponse.json({ followUps });
});
