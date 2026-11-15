import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody, parseId } from "@/lib/http";
import { badRequest, forbidden, notFound } from "@/lib/auth";
import { leaveAddOnSchema } from "@/lib/validation";
import { canManageSchedule, canManageUser } from "@/lib/roles";
import { istYear } from "@/lib/time";
import { leaveBalance } from "@/lib/leave";

type P = { id: string };

/** Paid-leave entitlement for a year: schedule quota + add-ons. */
export const GET = authed<P>(async (req, actor, { id }) => {
  const uid = parseId(id);
  if (!uid) return badRequest("Invalid id");
  const target = await prisma.user.findUnique({ where: { id: uid }, include: { schedule: true } });
  if (!target) return notFound();
  if (!canManageUser(actor, target)) return forbidden();

  const year = Number(new URL(req.url).searchParams.get("year")) || istYear();
  const addOns = await prisma.leaveAddOn.findMany({ where: { userId: uid, year }, orderBy: { createdAt: "desc" } });
  const balance = await leaveBalance(uid, year);
  return NextResponse.json({ ...balance, addOns });
});

/** Grants extra paid leave on top of the yearly quota. */
export const POST = authed<P>(async (req, actor, { id }) => {
  const uid = parseId(id);
  if (!uid) return badRequest("Invalid id");
  const target = await prisma.user.findUnique({ where: { id: uid } });
  if (!target) return notFound();
  if (!canManageSchedule(actor.role, target.role)) return forbidden();

  const body = await parseBody(req, leaveAddOnSchema);
  if ("error" in body) return body.error;
  const addOn = await prisma.leaveAddOn.create({
    data: { userId: uid, ...body.data, year: body.data.year ?? istYear(), grantedById: actor.id },
  });
  return NextResponse.json({ addOn }, { status: 201 });
});
