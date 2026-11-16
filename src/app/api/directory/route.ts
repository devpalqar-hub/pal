import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/http";

/** Everyone active (name, role, title only) — for pickers such as request assignees and meeting invitees. ?q= filters by name. */
export const GET = authed(async (req, actor) => {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  const users = await prisma.user.findMany({
    where: { isActive: true, id: { not: actor.id }, ...(q && { OR: [{ name: { contains: q } }, { designation: { contains: q } }] }) },
    select: { id: true, name: true, role: true, designation: true },
    orderBy: { name: "asc" },
    take: 300,
  });
  return NextResponse.json({ users });
});
