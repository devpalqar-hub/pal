import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import type { AuthUser } from "./auth";
import type { ProjectAccess } from "./project-access";
import { outranks, rank } from "./roles";

/**
 * Checks that `actor` may assign work to every user in `ids`:
 * yourself always; others must be project members and you must be a project manager,
 * or a LEAD+ who outranks them.
 */
export async function validateAssignees(ids: number[], actor: AuthUser, access: ProjectAccess): Promise<Response | null> {
  const others = ids.filter((id) => id !== actor.id);
  if (ids.includes(actor.id) && !access.memberIds.includes(actor.id) && !access.canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!others.length) return null;
  const users = await prisma.user.findMany({ where: { id: { in: others } }, select: { id: true, role: true, isActive: true } });
  for (const id of others) {
    const u = users.find((x) => x.id === id);
    if (!u?.isActive) return NextResponse.json({ error: `User ${id} not found` }, { status: 400 });
    if (!access.memberIds.includes(id)) return NextResponse.json({ error: "Assignees must be project members" }, { status: 400 });
    if (!(access.canManage || (rank(actor.role) >= rank("LEAD") && outranks(actor.role, u.role)))) {
      return NextResponse.json({ error: "You cannot assign work to one of these people" }, { status: 403 });
    }
  }
  return null;
}
