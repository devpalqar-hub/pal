import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authed, parseBody, parseId } from "@/lib/http";
import { badRequest, forbidden, notFound } from "@/lib/auth";
import { updateUserSchema } from "@/lib/validation";
import { canManageUser, outranks } from "@/lib/roles";
import { publicUser } from "@/lib/user-select";

type P = { id: string };

export const GET = authed<P>(async (_req, actor, { id }) => {
  const uid = parseId(id);
  if (!uid) return badRequest("Invalid id");
  const user = await prisma.user.findUnique({ where: { id: uid }, select: { ...publicUser, schedule: true } });
  if (!user) return notFound();
  if (!canManageUser(actor, user)) return forbidden();
  return NextResponse.json({ user });
});

export const PATCH = authed<P>(async (req, actor, { id }) => {
  const uid = parseId(id);
  if (!uid) return badRequest("Invalid id");
  const target = await prisma.user.findUnique({ where: { id: uid } });
  if (!target) return notFound();
  if (!canManageUser(actor, target)) return forbidden();

  const body = await parseBody(req, updateUserSchema);
  if ("error" in body) return body.error;
  const { password, isActive, ...rest } = body.data;

  // Deactivating is a management action, not allowed on yourself.
  if (isActive !== undefined && actor.id === target.id) return forbidden();
  // Only superiors may reset someone else's password / change their status.
  const isSelf = actor.id === target.id;
  if (!isSelf && !outranks(actor.role, target.role)) return forbidden();

  const user = await prisma.user.update({
    where: { id: uid },
    data: { ...rest, isActive, ...(password && { password: await bcrypt.hash(password, 10) }) },
    select: publicUser,
  });
  return NextResponse.json({ user });
});
