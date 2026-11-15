import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authed, parseBody } from "@/lib/http";

export const PUT = authed(async (req, actor) => {
  const body = await parseBody(req, z.object({ emailEnabled: z.boolean() }));
  if ("error" in body) return body.error;
  await prisma.user.update({ where: { id: actor.id }, data: { notifyEmail: body.data.emailEnabled } });
  return NextResponse.json({ emailEnabled: body.data.emailEnabled });
});
