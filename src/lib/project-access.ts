import { prisma } from "./prisma";
import type { AuthUser } from "./auth";
import { rank } from "./roles";

/** Only these roles may create projects. */
export const canCreateProject = (r: AuthUser["role"]) => rank(r) >= rank("MANAGER");

/**
 * Project permissions:
 *  - SUPER_ADMIN / COMPANY_HEAD manage every project
 *  - MANAGER manages projects they own or belong to
 *  - everyone else can see and work in projects they are a member of
 */
export async function projectAccess(projectId: number, actor: AuthUser) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: { select: { userId: true } } },
  });
  if (!project) return null;
  const isMember = project.members.some((m) => m.userId === actor.id);
  const canManage =
    actor.role === "SUPER_ADMIN" ||
    actor.role === "COMPANY_HEAD" ||
    (actor.role === "MANAGER" && (isMember || project.ownerId === actor.id));
  return { project, isMember, canManage, canView: isMember || canManage, memberIds: project.members.map((m) => m.userId) };
}

export type ProjectAccess = NonNullable<Awaited<ReturnType<typeof projectAccess>>>;
