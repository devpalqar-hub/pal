import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody, parseId } from "@/lib/http";
import { badRequest, conflict, forbidden, notFound } from "@/lib/auth";
import { leaveDecisionSchema } from "@/lib/validation";
import { canManageSchedule } from "@/lib/roles";
import { leaveBalance } from "@/lib/leave";
import { notify } from "@/lib/notify";

/** Approve / reject. Only a MANAGER+ who outranks the requester (never your own request). */
export const POST = authed<{ id: string }>(async (req, actor, { id }) => {
  const rid = parseId(id);
  if (!rid) return badRequest("Invalid id");
  const r = await prisma.leaveRequest.findUnique({ where: { id: rid }, include: { user: { select: { role: true } } } });
  if (!r) return notFound();
  if (r.userId === actor.id || !canManageSchedule(actor.role, r.user.role)) return forbidden();
  if (r.status !== "PENDING") return conflict(`Request is already ${r.status.toLowerCase()}`);

  const body = await parseBody(req, leaveDecisionSchema);
  if ("error" in body) return body.error;

  if (body.data.decision === "APPROVE" && r.type === "PAID") {
    // Pending days of this request are already reserved, so remaining must not be negative.
    const bal = await leaveBalance(r.userId, r.startDate.getUTCFullYear());
    if (bal.remaining < 0) return conflict("Approving would exceed the employee's paid leave balance. Grant add-on leave first.");
  }

  const updated = await prisma.leaveRequest.update({
    where: { id: rid },
    data: {
      status: body.data.decision === "APPROVE" ? "APPROVED" : "REJECTED",
      decidedById: actor.id,
      decisionNote: body.data.note,
      decidedAt: new Date(),
    },
  });
  const approved = body.data.decision === "APPROVE";
  await notify({
    userId: r.userId,
    type: "LEAVE_DECIDED",
    title: `Leave ${approved ? "approved" : "rejected"}`,
    body: `${actor.name} ${approved ? "approved" : "rejected"} your leave (${r.startDate.toISOString().slice(0, 10)}${r.endDate.getTime() !== r.startDate.getTime() ? ` → ${r.endDate.toISOString().slice(0, 10)}` : ""}).${body.data.note ? ` “${body.data.note}”` : ""}`,
    link: "/leave",
  });
  return NextResponse.json({ request: updated });
});
