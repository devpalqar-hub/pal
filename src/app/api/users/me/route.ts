import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/http";
import { publicUser } from "@/lib/user-select";

export const GET = authed(async (_req, actor) => {
  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { ...publicUser, schedule: true },
  });
  return NextResponse.json({ user });
});
