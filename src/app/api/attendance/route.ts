import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseId } from "@/lib/http";
import { badRequest, forbidden, notFound } from "@/lib/auth";
import { canManageUser } from "@/lib/roles";

/** Attendance history. Query: ?userId= (superiors only), ?from=YYYY-MM-DD, ?to=YYYY-MM-DD */
export const GET = authed(async (req, actor) => {
  const q = new URL(req.url).searchParams;
  let userId = actor.id;
  if (q.get("userId")) {
    const id = parseId(q.get("userId")!);
    if (!id) return badRequest("Invalid userId");
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return notFound();
    if (!canManageUser(actor, target)) return forbidden();
    userId = id;
  }
  const from = q.get("from");
  const to = q.get("to");
  const days = await prisma.attendanceDay.findMany({
    where: {
      userId,
      ...((from || to) && {
        date: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) },
      }),
    },
    orderBy: { date: "desc" },
  });
  return NextResponse.json({ days });
});
