import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseId } from "@/lib/http";
import { badRequest, conflict, forbidden, notFound } from "@/lib/auth";

/** Employees can withdraw their own pending requests. */
export const POST = authed<{ id: string }>(async (_req, actor, { id }) => {
  const rid = parseId(id);
  if (!rid) return badRequest("Invalid id");
  const r = await prisma.leaveRequest.findUnique({ where: { id: rid } });
  if (!r) return notFound();
  if (r.userId !== actor.id) return forbidden();
  if (r.status !== "PENDING") return conflict("Only pending requests can be cancelled");
  const request = await prisma.leaveRequest.update({ where: { id: rid }, data: { status: "CANCELLED" } });
  return NextResponse.json({ request });
});
