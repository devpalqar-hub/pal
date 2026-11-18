import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseId } from "@/lib/http";
import { badRequest, conflict, forbidden, notFound } from "@/lib/auth";
import { requestInclude } from "@/lib/requests";

/** Request with its full history. Visible to the requester, the assignee, SUPER_ADMIN and COMPANY_HEAD. */
export const GET = authed<{ id: string }>(async (_req, actor, { id }) => {
  const rid = parseId(id);
  if (!rid) return badRequest("Invalid id");
  const request = await prisma.serviceRequest.findUnique({
    where: { id: rid },
    include: { ...requestInclude, events: { include: { actor: { select: { id: true, name: true } } }, orderBy: { id: "asc" } } },
  });
  if (!request) return notFound("Request not found");
  const seesAll = actor.role === "SUPER_ADMIN" || actor.role === "COMPANY_HEAD";
  if (!seesAll && request.requesterId !== actor.id && request.assigneeId !== actor.id) return forbidden();
  return NextResponse.json({ request });
});

/**
 * Delete a request and its history.
 * Requester: while it is not yet approved (PENDING / RESUBMITTED / REJECTED) or after cancelling it.
 * SUPER_ADMIN / COMPANY_HEAD: any request.
 */
export const DELETE = authed<{ id: string }>(async (_req, actor, { id }) => {
  const rid = parseId(id);
  if (!rid) return badRequest("Invalid id");
  const r = await prisma.serviceRequest.findUnique({ where: { id: rid }, select: { requesterId: true, status: true } });
  if (!r) return notFound("Request not found");
  const admin = actor.role === "SUPER_ADMIN" || actor.role === "COMPANY_HEAD";
  if (!admin && r.requesterId !== actor.id) return forbidden();
  if (!admin && (r.status === "APPROVED" || r.status === "COMPLETE")) return conflict(`An ${r.status.toLowerCase()} request can't be deleted — it is part of the record`);
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { link: `/requests?open=${rid}` } }),
    prisma.serviceRequest.delete({ where: { id: rid } }),
  ]);
  return NextResponse.json({ ok: true });
});
