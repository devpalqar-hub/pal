import { NextResponse } from "next/server";
import type { LeaveStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authed, parseBody } from "@/lib/http";
import { conflict, badRequest } from "@/lib/auth";
import { leaveRequestSchema } from "@/lib/validation";
import { countWorkingDays, leaveBalance } from "@/lib/leave";
import { rank, ROLE_RANK } from "@/lib/roles";

const userSel = { select: { id: true, name: true, role: true, designation: true } } as const;

/** ?scope=mine (default) | team (requests from people you can approve for). Optional ?status= */
export const GET = authed(async (req, actor) => {
  const q = new URL(req.url).searchParams;
  const status = q.get("status") as LeaveStatus | null;
  let where: Record<string, unknown>;
  if (q.get("scope") === "team") {
    if (rank(actor.role) < rank("MANAGER")) return NextResponse.json({ requests: [] });
    const lower = (Object.keys(ROLE_RANK) as Role[]).filter((r) => actor.role === "SUPER_ADMIN" || ROLE_RANK[r] < ROLE_RANK[actor.role]);
    where = { user: { role: { in: lower } }, userId: { not: actor.id } };
  } else {
    where = { userId: actor.id };
  }
  const requests = await prisma.leaveRequest.findMany({
    where: { ...where, ...(status && { status }) },
    include: { user: userSel },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });
  return NextResponse.json({ requests });
});

export const POST = authed(async (req, actor) => {
  const body = await parseBody(req, leaveRequestSchema);
  if ("error" in body) return body.error;
  const { type, halfDay, reason } = body.data;
  const start = new Date(body.data.startDate);
  const end = new Date(body.data.endDate);

  const schedule = await prisma.workSchedule.findUnique({ where: { userId: actor.id } });
  const workDays = countWorkingDays(start, end, (schedule?.workingDays as number[] | undefined) ?? undefined);
  if (workDays === 0) return badRequest("The selected dates contain no working days");
  const days = halfDay ? 0.5 : workDays;

  const overlap = await prisma.leaveRequest.findFirst({
    where: { userId: actor.id, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: end }, endDate: { gte: start } },
  });
  if (overlap) return conflict("You already have a leave request overlapping these dates");

  if (type === "PAID") {
    const bal = await leaveBalance(actor.id, start.getUTCFullYear());
    if (days > bal.remaining) {
      return conflict(`Not enough paid leave: ${bal.remaining} day(s) remaining. Request unpaid leave or ask for an add-on.`, { remaining: bal.remaining });
    }
  }

  const request = await prisma.leaveRequest.create({
    data: { userId: actor.id, type, startDate: start, endDate: end, days, halfDay, reason },
  });
  return NextResponse.json({ request }, { status: 201 });
});
