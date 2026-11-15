import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/http";
import { LEAVE_TYPES, TASK_TYPES } from "@/lib/notify";

/** ?filter=unread|all  ?category=task|leave  ?limit= (max 100)  ?before=<id> */
export const GET = authed(async (req, actor) => {
  const q = new URL(req.url).searchParams;
  const where: Prisma.NotificationWhereInput = { userId: actor.id };
  if (q.get("filter") === "unread") where.readAt = null;
  const cat = q.get("category");
  if (cat === "task") where.type = { in: TASK_TYPES };
  if (cat === "leave") where.type = { in: LEAVE_TYPES };
  const before = Number(q.get("before"));
  if (before) where.id = { lt: before };
  const limit = Math.min(100, Number(q.get("limit")) || 20);

  const [notifications, unread, user] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { id: "desc" }, take: limit }),
    prisma.notification.count({ where: { userId: actor.id, readAt: null } }),
    prisma.user.findUnique({ where: { id: actor.id }, select: { notifyEmail: true } }),
  ]);
  return NextResponse.json({ notifications, unread, emailEnabled: user?.notifyEmail ?? true });
});
