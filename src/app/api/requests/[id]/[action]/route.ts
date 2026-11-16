import { NextResponse } from "next/server";
import type { RequestEventType, RequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authed, parseBody, parseId } from "@/lib/http";
import { badRequest, conflict, forbidden, notFound } from "@/lib/auth";
import { requestActionSchema, resubmitRequestSchema } from "@/lib/validation";
import { validateForm } from "@/lib/request-types";
import { notify } from "@/lib/notify";
import { requestInclude } from "@/lib/requests";

/**
 * Request workflow:
 *
 *   send ─▶ PENDING ──approve──▶ APPROVED ──complete──▶ COMPLETE
 *              │  ▲                 │
 *           reject  └─ RESUBMITTED   └─ (requester may cancel any open stage)
 *              ▼          ▲
 *           REJECTED ─resubmit
 *
 * assignee: approve · reject (reason required) · complete · reassign
 * requester: resubmit (after a rejection, with edits) · cancel · reassign
 */
const ACTIONS = ["approve", "reject", "complete", "resubmit", "cancel", "reassign"] as const;
type Action = (typeof ACTIONS)[number];

export const POST = authed<{ id: string; action: string }>(async (req, actor, p) => {
  const rid = parseId(p.id);
  if (!rid) return badRequest("Invalid id");
  if (!(ACTIONS as readonly string[]).includes(p.action)) return notFound("Unknown action");
  const action = p.action as Action;

  const r = await prisma.serviceRequest.findUnique({ where: { id: rid } });
  if (!r) return notFound("Request not found");
  const isAssignee = r.assigneeId === actor.id;
  const isRequester = r.requesterId === actor.id;
  const need = (ok: boolean) => (ok ? null : forbidden());
  const stateErr = (allowed: RequestStatus[]) => (allowed.includes(r.status) ? null : conflict(`A ${r.status.toLowerCase()} request cannot be ${{ approve: "approved", reject: "rejected", complete: "completed", resubmit: "resubmitted", cancel: "cancelled", reassign: "reassigned" }[action]}`));

  let status: RequestStatus = r.status;
  let evt: RequestEventType;
  const data: Record<string, unknown> = {};
  let note: string | undefined;
  let notifyUser = r.requesterId;
  let notifyType: "REQUEST_REJECTED" | "REQUEST_APPROVED" | "REQUEST_COMPLETED" | "REQUEST_RESUBMITTED" | "REQUEST_RECEIVED" = "REQUEST_APPROVED";
  let notifyTitle = "";

  if (action === "resubmit") {
    const bad = need(isRequester) ?? stateErr(["REJECTED"]);
    if (bad) return bad;
    const body = await parseBody(req, resubmitRequestSchema);
    if ("error" in body) return body.error;
    const { data: answers, note: n, dueDate, ...edits } = body.data;
    if (answers) {
      const form = validateForm(r.type, answers);
      if ("errors" in form) return NextResponse.json({ error: { fieldErrors: Object.fromEntries(Object.entries(form.errors).map(([k, v]) => [k, [v]])), formErrors: [] } }, { status: 400 });
      data.data = form.data;
    }
    Object.assign(data, edits);
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    data.resubmitCount = { increment: 1 };
    data.decisionNote = null;
    status = "RESUBMITTED"; evt = "RESUBMITTED"; note = n;
    notifyUser = r.assigneeId; notifyType = "REQUEST_RESUBMITTED"; notifyTitle = `Resubmitted: ${r.title}`;
  } else {
    const body = await parseBody(req, requestActionSchema);
    if ("error" in body) return body.error;
    note = body.data.note;

    if (action === "approve") {
      const bad = need(isAssignee) ?? stateErr(["PENDING", "RESUBMITTED"]);
      if (bad) return bad;
      status = "APPROVED"; evt = "APPROVED"; data.decidedAt = new Date(); data.decisionNote = note ?? null;
      notifyType = "REQUEST_APPROVED"; notifyTitle = `Approved: ${r.title}`;
    } else if (action === "reject") {
      const bad = need(isAssignee) ?? stateErr(["PENDING", "RESUBMITTED"]);
      if (bad) return bad;
      if (!note?.trim()) return badRequest("Please give a reason for rejecting");
      status = "REJECTED"; evt = "REJECTED"; data.decidedAt = new Date(); data.decisionNote = note;
      notifyType = "REQUEST_REJECTED"; notifyTitle = `Rejected: ${r.title}`;
    } else if (action === "complete") {
      const bad = need(isAssignee) ?? stateErr(["APPROVED"]);
      if (bad) return bad;
      status = "COMPLETE"; evt = "COMPLETED"; data.completedAt = new Date();
      if (body.data.resultUrl) data.resultUrl = body.data.resultUrl;
      if (note) data.decisionNote = note;
      notifyType = "REQUEST_COMPLETED"; notifyTitle = `Completed: ${r.title}`;
    } else if (action === "cancel") {
      const bad = need(isRequester) ?? stateErr(["PENDING", "REJECTED", "RESUBMITTED", "APPROVED"]);
      if (bad) return bad;
      status = "CANCELLED"; evt = "CANCELLED";
      notifyUser = r.assigneeId; notifyType = "REQUEST_RECEIVED"; notifyTitle = `Cancelled: ${r.title}`;
    } else {
      // reassign: the current assignee can forward it, the requester can redirect it
      const bad = need(isAssignee || isRequester) ?? stateErr(["PENDING", "REJECTED", "RESUBMITTED", "APPROVED"]);
      if (bad) return bad;
      const to = body.data.assigneeId;
      if (!to || to === r.assigneeId || to === r.requesterId) return badRequest("Choose a different person to hand this to");
      const u = await prisma.user.findUnique({ where: { id: to }, select: { isActive: true } });
      if (!u?.isActive) return badRequest("User not found");
      data.assigneeId = to;
      if (r.status === "RESUBMITTED" || r.status === "APPROVED") status = "PENDING";
      evt = "REASSIGNED"; notifyUser = to; notifyType = "REQUEST_RECEIVED"; notifyTitle = `Request assigned to you: ${r.title}`;
      note = note ?? `Handed over to user ${to}`;
    }
  }

  const [request] = await prisma.$transaction([
    prisma.serviceRequest.update({ where: { id: rid }, data: { ...data, status }, include: requestInclude }),
    prisma.requestEvent.create({ data: { requestId: rid, type: evt, actorId: actor.id, note } }),
  ]);
  if (notifyUser !== actor.id) {
    await notify({ userId: notifyUser, type: notifyType, title: notifyTitle, body: `${actor.name}${note ? `: “${note}”` : ""}`, link: `/requests?open=${rid}` });
  }
  return NextResponse.json({ request });
});
