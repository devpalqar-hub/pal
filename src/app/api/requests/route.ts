import { NextResponse } from "next/server";
import type { Prisma, RequestStatus, RequestType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authed, parseBody } from "@/lib/http";
import { badRequest } from "@/lib/auth";
import { createRequestSchema } from "@/lib/validation";
import { validateForm } from "@/lib/request-types";
import { notify } from "@/lib/notify";
import { requestInclude } from "@/lib/requests";

/**
 * ?box=incoming (assigned to me, default) | sent (I raised) | all (SUPER_ADMIN / COMPANY_HEAD)
 * ?status= ?type= ?q=
 */
export const GET = authed(async (req, actor) => {
  const q = new URL(req.url).searchParams;
  const box = q.get("box") ?? "incoming";
  const where: Prisma.ServiceRequestWhereInput = {};
  if (box === "sent") where.requesterId = actor.id;
  else if (box === "all") {
    if (actor.role !== "SUPER_ADMIN" && actor.role !== "COMPANY_HEAD") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else where.assigneeId = actor.id;
  if (q.get("status")) where.status = q.get("status") as RequestStatus;
  if (q.get("type")) where.type = q.get("type") as RequestType;
  if (q.get("q")) where.title = { contains: q.get("q")! };

  const requests = await prisma.serviceRequest.findMany({ where, include: requestInclude, orderBy: { updatedAt: "desc" }, take: 200 });
  return NextResponse.json({ requests });
});

/** Send a new request to a person. Starts as PENDING. */
export const POST = authed(async (req, actor) => {
  const body = await parseBody(req, createRequestSchema);
  if ("error" in body) return body.error;
  const { data: raw, dueDate, ...rest } = body.data;

  if (rest.assigneeId === actor.id) return badRequest("Send the request to someone else");
  const assignee = await prisma.user.findUnique({ where: { id: rest.assigneeId }, select: { isActive: true } });
  if (!assignee?.isActive) return badRequest("Assignee not found");
  if (rest.projectId && !(await prisma.project.findUnique({ where: { id: rest.projectId }, select: { id: true } }))) return badRequest("Project not found");

  const form = validateForm(rest.type, raw);
  if ("errors" in form) return NextResponse.json({ error: { fieldErrors: Object.fromEntries(Object.entries(form.errors).map(([k, v]) => [k, [v]])), formErrors: [] } }, { status: 400 });

  const request = await prisma.serviceRequest.create({
    data: { ...rest, data: form.data, requesterId: actor.id, dueDate: dueDate ? new Date(dueDate) : undefined, events: { create: { type: "SENT", actorId: actor.id } } },
    include: requestInclude,
  });
  await notify({ userId: request.assigneeId, type: "REQUEST_RECEIVED", title: `New request: ${request.title}`, body: `${actor.name} sent you a request that needs your approval.`, link: `/requests?open=${request.id}` });
  return NextResponse.json({ request }, { status: 201 });
});
