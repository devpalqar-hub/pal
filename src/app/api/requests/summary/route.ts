import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/http";

/** Cheap counts for badges: what needs my action, and what bounced back to me. */
export const GET = authed(async (_req, actor) => {
  const [awaitingMe, needsFix, approvedForMe] = await Promise.all([
    prisma.serviceRequest.count({ where: { assigneeId: actor.id, status: { in: ["PENDING", "RESUBMITTED"] } } }),
    prisma.serviceRequest.count({ where: { requesterId: actor.id, status: "REJECTED" } }),
    prisma.serviceRequest.count({ where: { assigneeId: actor.id, status: "APPROVED" } }),
  ]);
  return NextResponse.json({ awaitingMe, needsFix, approvedForMe, actionNeeded: awaitingMe + needsFix + approvedForMe });
});
