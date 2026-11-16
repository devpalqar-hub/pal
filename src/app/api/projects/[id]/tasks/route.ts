import { NextResponse } from "next/server";
import type { Prisma, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authed, parseBody, parseId } from "@/lib/http";
import { badRequest, conflict, notFound } from "@/lib/auth";
import { createTaskSchema } from "@/lib/validation";
import { projectAccess } from "@/lib/project-access";
import { taskInclude, withLiveTime } from "@/lib/task-flow";
import { validateAssignees } from "@/lib/assign";
import { notify } from "@/lib/notify";

type P = { id: string };

/** Query: ?status=, ?assigneeId=, ?parentId=<id|none> (none = top-level tasks only) */
export const GET = authed<P>(async (req, actor, { id }) => {
  const pid = parseId(id);
  if (!pid) return badRequest("Invalid id");
  const access = await projectAccess(pid, actor);
  if (!access?.canView) return notFound("Project not found");

  const q = new URL(req.url).searchParams;
  const where: Prisma.TaskWhereInput = { projectId: pid };
  if (q.get("status")) where.status = q.get("status") as TaskStatus;
  if (q.get("assigneeId")) where.assignees = { some: { userId: Number(q.get("assigneeId")), status: "ASSIGNED" } };
  if (q.get("parentId")) where.parentId = q.get("parentId") === "none" ? null : Number(q.get("parentId"));

  const tasks = await prisma.task.findMany({ where, include: taskInclude, orderBy: [{ createdAt: "asc" }] });
  return NextResponse.json({ tasks: tasks.map((t) => withLiveTime(t, actor.id)) });
});

/** Create a task (or sub-task with parentId), assigned to one or several project members. */
export const POST = authed<P>(async (req, actor, { id }) => {
  const pid = parseId(id);
  if (!pid) return badRequest("Invalid id");
  const access = await projectAccess(pid, actor);
  if (!access?.canView) return notFound("Project not found");
  if (access.project.status === "ARCHIVED") return conflict("Project is archived");

  const body = await parseBody(req, createTaskSchema);
  if ("error" in body) return body.error;
  const { dueDate, parentId, assigneeIds: rawIds, assigneeId, ...data } = body.data;
  const ids = [...new Set(rawIds ?? (assigneeId === undefined ? [actor.id] : assigneeId === null ? [] : [assigneeId]))];

  if (parentId) {
    const parent = await prisma.task.findUnique({ where: { id: parentId } });
    if (!parent || parent.projectId !== pid) return badRequest("Parent task not found in this project");
    if (parent.status === "ENDED") return conflict("Cannot add sub-tasks to an ended task");
  }
  const bad = await validateAssignees(ids, actor, access);
  if (bad) return bad;

  const task = await prisma.task.create({
    data: {
      ...data,
      projectId: pid,
      parentId,
      assigneeId: ids[0] ?? null,
      createdById: actor.id,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      assignees: { create: ids.map((userId) => ({ userId })) },
      events: {
        create: [
          { type: "CREATED", actorId: actor.id },
          ...(ids.length ? [{ type: "ASSIGNED" as const, actorId: actor.id, note: `Assigned to ${ids.length} ${ids.length === 1 ? "person" : "people"}` }] : []),
        ],
      },
    },
    include: taskInclude,
  });
  for (const userId of ids.filter((u) => u !== actor.id)) {
    await notify({ userId, type: "TASK_ASSIGNED", title: `New task: ${task.title}`, body: `${actor.name} assigned you a task in ${access.project.name}${ids.length > 1 ? ` (shared with ${ids.length - 1} other${ids.length > 2 ? "s" : ""})` : ""}.`, taskId: task.id });
  }
  return NextResponse.json({ task: withLiveTime(task, actor.id) }, { status: 201 });
});
