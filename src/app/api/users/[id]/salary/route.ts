import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody, parseId } from "@/lib/http";
import { badRequest, forbidden, notFound } from "@/lib/auth";
import { salarySchema } from "@/lib/validation";
import { canManageSalary } from "@/lib/roles";
import { istDateString } from "@/lib/time";

type P = { id: string };

/** Salary is visible to the user themself and to superiors who may manage salary. */
export const GET = authed<P>(async (_req, actor, { id }) => {
  const uid = parseId(id);
  if (!uid) return badRequest("Invalid id");
  const target = await prisma.user.findUnique({ where: { id: uid } });
  if (!target) return notFound();
  if (actor.id !== uid && !canManageSalary(actor.role, target.role)) return forbidden();

  const history = await prisma.salaryRecord.findMany({ where: { userId: uid }, orderBy: { effectiveFrom: "desc" } });
  const today = new Date();
  const current = history.find((s) => s.effectiveFrom <= today) ?? null;
  return NextResponse.json({ current, history });
});

/** Adds a new salary record (initial salary or increment/revision). */
export const POST = authed<P>(async (req, actor, { id }) => {
  const uid = parseId(id);
  if (!uid) return badRequest("Invalid id");
  const target = await prisma.user.findUnique({ where: { id: uid } });
  if (!target) return notFound();
  if (!canManageSalary(actor.role, target.role)) return forbidden();

  const body = await parseBody(req, salarySchema);
  if ("error" in body) return body.error;
  const { effectiveFrom, ...rest } = body.data;
  const record = await prisma.salaryRecord.create({
    data: {
      userId: uid,
      ...rest,
      effectiveFrom: new Date(effectiveFrom ?? istDateString()),
      createdById: actor.id,
    },
  });
  return NextResponse.json({ salary: record }, { status: 201 });
});
