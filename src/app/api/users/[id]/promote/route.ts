import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody, parseId } from "@/lib/http";
import { badRequest, forbidden, notFound } from "@/lib/auth";
import { promoteSchema } from "@/lib/validation";
import { canAssignRole, outranks } from "@/lib/roles";
import { publicUser } from "@/lib/user-select";

/** Promote or demote: caller must outrank both the user's current role and the new role. */
export const POST = authed<{ id: string }>(async (req, actor, { id }) => {
  const uid = parseId(id);
  if (!uid) return badRequest("Invalid id");
  const target = await prisma.user.findUnique({ where: { id: uid } });
  if (!target) return notFound();
  if (target.id === actor.id) return forbidden();
  if (!outranks(actor.role, target.role)) return forbidden();

  const body = await parseBody(req, promoteSchema);
  if ("error" in body) return body.error;
  const { role, designation, note } = body.data;
  if (!canAssignRole(actor.role, role)) return forbidden();
  if (role === target.role) return NextResponse.json({ error: "User already has this role" }, { status: 409 });

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: uid },
      data: { role, ...(designation !== undefined && { designation }) },
      select: publicUser,
    }),
    prisma.roleChange.create({
      data: { userId: uid, fromRole: target.role, toRole: role, changedById: actor.id, note },
    }),
  ]);
  return NextResponse.json({ user });
});
