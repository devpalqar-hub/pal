import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authed, parseBody } from "@/lib/http";
import { notify } from "@/lib/notify";
import { activeOf, taskCtx } from "@/lib/task-flow";

const schema = z.object({ body: z.string().trim().min(1, "Write something first").max(2000) });

/** Ask a doubt / leave a comment. Anyone who can see the task may comment; the creator, assignees and reviewer are notified. */
export const POST = authed<{ id: string }>(async (req, actor, { id }) => {
  const ctx = await taskCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const { task } = ctx;
  const body = await parseBody(req, schema);
  if ("error" in body) return body.error;

  const comment = await prisma.taskComment.create({
    data: { taskId: task.id, authorId: actor.id, body: body.data.body },
    include: { author: { select: { id: true, name: true } } },
  });

  const prior = await prisma.taskComment.findMany({ where: { taskId: task.id }, select: { authorId: true }, distinct: ["authorId"] });
  const audience = new Set<number>([task.createdById, ...activeOf(task).map((a) => a.userId), ...prior.map((c) => c.authorId)]);
  if (task.reviewerId) audience.add(task.reviewerId);
  audience.delete(actor.id);
  const text = body.data.body;
  for (const userId of audience) {
    await notify({ userId, type: "TASK_COMMENT", title: `New comment on: ${task.title}`, body: `${actor.name}: ${text.length > 200 ? text.slice(0, 197) + "…" : text}`, taskId: task.id });
  }
  return NextResponse.json({ comment }, { status: 201 });
});
