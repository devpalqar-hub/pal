import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody } from "@/lib/http";
import { forbidden } from "@/lib/auth";
import { createProjectSchema } from "@/lib/validation";
import { canCreateProject } from "@/lib/project-access";

/** Projects you can see: all for SUPER_ADMIN / COMPANY_HEAD, otherwise the ones you belong to. */
export const GET = authed(async (req, actor) => {
  const status = new URL(req.url).searchParams.get("status");
  const seesAll = actor.role === "SUPER_ADMIN" || actor.role === "COMPANY_HEAD";
  const projects = await prisma.project.findMany({
    where: {
      ...(seesAll ? {} : { members: { some: { userId: actor.id } } }),
      ...(status && { status: status as never }),
    },
    include: { owner: { select: { id: true, name: true } }, _count: { select: { members: true, tasks: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ projects });
});

export const POST = authed(async (req, actor) => {
  if (!canCreateProject(actor.role)) return forbidden();
  const body = await parseBody(req, createProjectSchema);
  if ("error" in body) return body.error;
  const { memberIds = [], startDate, dueDate, ...data } = body.data;

  const ids = [...new Set(memberIds)].filter((id) => id !== actor.id);
  const found = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } });
  if (found.length !== ids.length) return NextResponse.json({ error: "One or more members not found" }, { status: 400 });

  const project = await prisma.project.create({
    data: {
      ...data,
      startDate: startDate ? new Date(startDate) : undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      ownerId: actor.id,
      members: {
        create: [
          { userId: actor.id, role: "OWNER", addedById: actor.id },
          ...ids.map((userId) => ({ userId, addedById: actor.id })),
        ],
      },
    },
    include: { members: true },
  });
  return NextResponse.json({ project }, { status: 201 });
});
