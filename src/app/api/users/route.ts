import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authed, parseBody } from "@/lib/http";
import { forbidden } from "@/lib/auth";
import { createUserSchema } from "@/lib/validation";
import { canAssignRole, canManageSalary, canManageSchedule, ROLE_RANK } from "@/lib/roles";
import { publicUser } from "@/lib/user-select";
import { istDateString } from "@/lib/time";
import { encryptSecret } from "@/lib/mail";

/** Lists users the caller outranks (super admin sees everyone). Optional ?role= filter. */
export const GET = authed(async (req, actor) => {
  const url = new URL(req.url);
  const roleFilter = url.searchParams.get("role") as Role | null;
  const visible = (Object.keys(ROLE_RANK) as Role[]).filter(
    (r) => actor.role === "SUPER_ADMIN" || ROLE_RANK[r] < ROLE_RANK[actor.role],
  );
  const roles = roleFilter ? visible.filter((r) => r === roleFilter) : visible;
  const users = await prisma.user.findMany({
    where: { role: { in: roles } },
    select: publicUser,
    orderBy: { id: "asc" },
  });
  return NextResponse.json({ users });
});

export const POST = authed(async (req, actor) => {
  const body = await parseBody(req, createUserSchema);
  if ("error" in body) return body.error;
  const { schedule, salary, password, mailPassword, ...data } = body.data;

  if (!canAssignRole(actor.role, data.role)) return forbidden();
  if (schedule && !canManageSchedule(actor.role, data.role)) return forbidden();
  if (salary && !canManageSalary(actor.role, data.role)) return forbidden();

  if (await prisma.user.findUnique({ where: { email: data.email } })) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  if (data.mailEmail && (await prisma.user.findUnique({ where: { mailEmail: data.mailEmail } }))) {
    return NextResponse.json({ error: "Mailbox is already assigned to another user" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      ...data,
      ...(mailPassword && { mailPasswordEnc: encryptSecret(mailPassword) }),
      password: await bcrypt.hash(password, 10),
      createdById: actor.id,
      roleChanges: { create: { toRole: data.role, changedById: actor.id, note: "Created" } },
      ...(schedule && { schedule: { create: schedule } }),
      ...(salary && {
        salaries: {
          create: {
            amount: salary.amount,
            currency: salary.currency,
            reason: salary.reason ?? "Initial salary",
            effectiveFrom: new Date(salary.effectiveFrom ?? istDateString()),
            createdById: actor.id,
          },
        },
      }),
    },
    select: publicUser,
  });
  return NextResponse.json({ user }, { status: 201 });
});
