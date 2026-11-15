import { NextResponse } from "next/server";
import type { Prisma, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authed, parseBody, parseId } from "@/lib/http";
import { badRequest, conflict, forbidden, notFound } from "@/lib/auth";
import { createTaskSchema } from "@/lib/validation";
import { projectAccess } from "@/lib/project-access";
import { outranks, rank } from "@/lib/roles";
import { taskInclude, withLiveTime } from "@/lib/task-flow";
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
  if (q.get("assigneeId")) where.assigneeId = Number(q.get("assigneeId"));
  if (q.get("parentId")) where.parentId = q.get("parentId") === "none" ? null : Number(q.get("parentId"));

  const tasks = await prisma.task.findMany({ where, include: taskInclude, orderBy: [{ createdAt: "asc" }] });
  return NextResponse.json({ tasks: tasks.map(withLiveTime) });
});

/**
 * Create a task (or a sub-task when parentId is set).
 * Anyone in the project can create a task for themself; assigning to others needs a LEAD+ who outranks them,
 * or a project manager.
 */
export const POST = authed<P>(async (req, actor, { id }) => {
  const pid = parseId(id);
  if (!pid) return badRequest("Invalid id");
  const access = await projectAccess(pid, actor);
  if (!access?.canView) return notFound("Project not found");
  if (access.project.status === "ARCHIVED") return conflict("Project is archived");

  const body = await parseBody(req, createTaskSchema);
  if ("error" in body) return body.error;
  const { dueDate, parentId, assigneeId: rawAssignee, ...data } = body.data;
  const assigneeId = rawAssignee === undefined ? actor.id : rawAssignee;

  if (parentId) {
    const parent = await prisma.task.findUnique({ where: { id: parentId } });
    if (!parent || parent.projectId !== pid) return badRequest("Parent task not found in this project");
    if (parent.status === "ENDED") return conflict("Cannot add sub-tasks to an ended task");
  }

  if (assigneeId !== null && assigneeId !== actor.id) {
    if (!access.memberIds.includes(assigneeId)) return badRequest("Assignee must be a project member");
    const assignee = await prisma.user.findUnique({ where: { id: assigneeId }, select: { role: true, isActive: true } });
    if (!assignee?.isActive) return badRequest("Assignee not found");
    const allowed = access.canManage || (rank(actor.role) >= rank("LEAD") && outranks(actor.role, assignee.role));
    if (!allowed) return forbidden();
  } else if (assigneeId === actor.id && !access.memberIds.includes(actor.id) && !access.canManage) {
    return forbidden();
  }

  const task = await prisma.task.create({
    data: {
      ...data,
      projectId: pid,
      parentId,
      assigneeId,
      createdById: actor.id,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      events: {
        create: [
          { type: "CREATED", actorId: actor.id },
          ...(assigneeId ? [{ type: "ASSIGNED" as const, actorId: actor.id, note: `Assigned to user ${assigneeId}` }] : []),
        ],
      },
    },
    include: taskInclude,
  });
  if (task.assigneeId && task.assigneeId !== actor.id) {
    await notify({ userId: task.assigneeId, type: "TASK_ASSIGNED", title: `New task: ${task.title}`, body: `${actor.name} assigned you a task in ${access.project.name}.`, taskId: task.id });
  }
  return NextResponse.json({ task: withLiveTime(task) }, { status: 201 });
});
