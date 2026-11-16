import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseId } from "@/lib/http";
import { badRequest, forbidden, notFound } from "@/lib/auth";
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
