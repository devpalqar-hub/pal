import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/http";
import { disconnectAccount, googleConfigured } from "@/lib/google-calendar";

/** Google Calendar connection status for the caller. */
export const GET = authed(async (_req, actor) => {
  const acc = await prisma.googleAccount.findUnique({ where: { userId: actor.id }, select: { email: true, createdAt: true } });
  return NextResponse.json({ configured: googleConfigured(), connected: !!acc && googleConfigured(), email: acc?.email ?? null, since: acc?.createdAt ?? null });
});

export const DELETE = authed(async (_req, actor) => {
  await disconnectAccount(actor.id);
  return NextResponse.json({ connected: false });
});
