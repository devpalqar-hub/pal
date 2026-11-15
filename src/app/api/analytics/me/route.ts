import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseId } from "@/lib/http";
import { badRequest, forbidden, notFound } from "@/lib/auth";
import { canManageUser } from "@/lib/roles";
import { personalAnalytics } from "@/lib/analytics";

/** Your analytics, or ?userId= for someone you manage. */
export const GET = authed(async (req, actor) => {
  const raw = new URL(req.url).searchParams.get("userId");
  let userId = actor.id;
  if (raw) {
    const id = parseId(raw);
    if (!id) return badRequest("Invalid userId");
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!target) return notFound();
    if (!canManageUser(actor, target)) return forbidden();
    userId = id;
  }
  return NextResponse.json(await personalAnalytics(userId));
});
