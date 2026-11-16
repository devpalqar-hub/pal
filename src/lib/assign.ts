import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import type { AuthUser } from "./auth";
import type { ProjectAccess } from "./project-access";

/**
 * Checks that `actor` may assign work to every user in `ids`:
 * anyone with access to the project may add any active project member.
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
  }
  return null;
}
