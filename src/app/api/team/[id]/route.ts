import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseId } from "@/lib/http";
import { badRequest, forbidden, notFound } from "@/lib/auth";
import { canOverseeUser, memberDetail } from "@/lib/oversight";

/** One person under the caller: their tasks with status and time, attendance and work-culture breakdown. */
export const GET = authed<{ id: string }>(async (req, actor, { id }) => {
  const uid = parseId(id);
  if (!uid) return badRequest("Invalid id");
  const target = await prisma.user.findUnique({ where: { id: uid }, select: { id: true, role: true } });
  if (!target) return notFound("User not found");
  if (!canOverseeUser(actor, target)) return forbidden();
  const days = Math.min(90, Math.max(7, Number(new URL(req.url).searchParams.get("days")) || 30));
  return NextResponse.json(await memberDetail(target, days));
});
