import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody, parseId } from "@/lib/http";
import { badRequest, conflict, forbidden, notFound } from "@/lib/auth";
import { addMemberSchema } from "@/lib/validation";
import { projectAccess } from "@/lib/project-access";

export const POST = authed<{ id: string }>(async (req, actor, { id }) => {
  const pid = parseId(id);
  if (!pid) return badRequest("Invalid id");
  const access = await projectAccess(pid, actor);
  if (!access?.canView) return notFound("Project not found");
  if (!access.canManage) return forbidden();

  const body = await parseBody(req, addMemberSchema);
  if ("error" in body) return body.error;
  const user = await prisma.user.findUnique({ where: { id: body.data.userId } });
  if (!user?.isActive) return notFound("User not found");
  if (access.memberIds.includes(user.id)) return conflict("Already a member");

  const member = await prisma.projectMember.create({
    data: { projectId: pid, userId: user.id, addedById: actor.id },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
  });
  return NextResponse.json({ member }, { status: 201 });
});
