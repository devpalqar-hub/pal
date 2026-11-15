import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseId } from "@/lib/http";
import { badRequest, conflict, forbidden, notFound } from "@/lib/auth";
import { projectAccess } from "@/lib/project-access";

export const DELETE = authed<{ id: string; userId: string }>(async (_req, actor, p) => {
  const pid = parseId(p.id);
  const uid = parseId(p.userId);
  if (!pid || !uid) return badRequest("Invalid id");
  const access = await projectAccess(pid, actor);
  if (!access?.canView) return notFound("Project not found");
  if (!access.canManage) return forbidden();
  if (!access.memberIds.includes(uid)) return notFound("Member not found");
  if (uid === access.project.ownerId) return conflict("The project owner cannot be removed");

  const open = await prisma.task.count({
    where: { projectId: pid, OR: [{ assigneeId: uid }, { reviewerId: uid, status: "IN_REVIEW" }], status: { not: "ENDED" } },
  });
  if (open) return conflict("Member still has open tasks in this project; reassign them first", { openTasks: open });

  await prisma.projectMember.delete({ where: { projectId_userId: { projectId: pid, userId: uid } } });
  return NextResponse.json({ ok: true });
});
