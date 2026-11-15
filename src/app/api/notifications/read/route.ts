import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authed, parseBody } from "@/lib/http";

const schema = z.object({
  ids: z.array(z.number().int()).optional(),
  taskId: z.number().int().optional(),
  all: z.boolean().optional(),
});

/** Mark notifications read: by ids, for a task, or all. */
export const POST = authed(async (req, actor) => {
  const body = await parseBody(req, schema);
  if ("error" in body) return body.error;
  const { ids, taskId, all } = body.data;
  if (!ids?.length && !taskId && !all) return NextResponse.json({ error: "Nothing to mark" }, { status: 400 });
  const r = await prisma.notification.updateMany({
    where: { userId: actor.id, readAt: null, ...(all ? {} : { OR: [...(ids?.length ? [{ id: { in: ids } }] : []), ...(taskId ? [{ taskId }] : [])] }) },
    data: { readAt: new Date() },
  });
  const unread = await prisma.notification.count({ where: { userId: actor.id, readAt: null } });
  return NextResponse.json({ marked: r.count, unread });
});
