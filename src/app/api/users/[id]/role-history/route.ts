import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseId } from "@/lib/http";
import { badRequest, forbidden, notFound } from "@/lib/auth";
import { canManageUser } from "@/lib/roles";

export const GET = authed<{ id: string }>(async (_req, actor, { id }) => {
  const uid = parseId(id);
  if (!uid) return badRequest("Invalid id");
  const target = await prisma.user.findUnique({ where: { id: uid } });
  if (!target) return notFound();
  if (!canManageUser(actor, target)) return forbidden();
  const history = await prisma.roleChange.findMany({ where: { userId: uid }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ history });
});
