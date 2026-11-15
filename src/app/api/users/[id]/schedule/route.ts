import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody, parseId } from "@/lib/http";
import { badRequest, forbidden, notFound } from "@/lib/auth";
import { scheduleSchema } from "@/lib/validation";
import { canManageSchedule, canManageUser } from "@/lib/roles";

type P = { id: string };

export const GET = authed<P>(async (_req, actor, { id }) => {
  const uid = parseId(id);
  if (!uid) return badRequest("Invalid id");
  const target = await prisma.user.findUnique({ where: { id: uid } });
  if (!target) return notFound();
  if (!canManageUser(actor, target)) return forbidden();
  const schedule = await prisma.workSchedule.findUnique({ where: { userId: uid } });
  return NextResponse.json({ schedule });
});

/** Create or replace the work schedule (times, working days, required hours, paid leave quota). */
export const PUT = authed<P>(async (req, actor, { id }) => {
  const uid = parseId(id);
  if (!uid) return badRequest("Invalid id");
  const target = await prisma.user.findUnique({ where: { id: uid } });
  if (!target) return notFound();
  if (!canManageSchedule(actor.role, target.role)) return forbidden();

  const body = await parseBody(req, scheduleSchema);
  if ("error" in body) return body.error;
  const schedule = await prisma.workSchedule.upsert({
    where: { userId: uid },
    create: { userId: uid, ...body.data },
    update: body.data,
  });
  return NextResponse.json({ schedule });
});
