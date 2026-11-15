import { Role } from "@prisma/client";

export const ROLE_RANK: Record<Role, number> = {
  SUPER_ADMIN: 100,
  COMPANY_HEAD: 80,
  MANAGER: 60,
  LEAD: 40,
  STAFF: 20,
};

export const rank = (r: Role) => ROLE_RANK[r];

/** Actor is strictly above the given role (SUPER_ADMIN may act on any role). */
export const outranks = (actor: Role, target: Role) =>
  actor === "SUPER_ADMIN" || rank(actor) > rank(target);

/** Can create users / assign this role. */
export const canAssignRole = outranks;

/** Can view or edit basic profile of target user. */
export const canManageUser = (actor: { id: number; role: Role }, target: { id: number; role: Role }) =>
  actor.id === target.id || outranks(actor.role, target.role);

/** Schedule & leave management: MANAGER and above, over lower roles. */
export const canManageSchedule = (actor: Role, target: Role) =>
  rank(actor) >= rank("MANAGER") && outranks(actor, target);

/** Salary management: COMPANY_HEAD and above, over lower roles. */
export const canManageSalary = (actor: Role, target: Role) =>
  rank(actor) >= rank("COMPANY_HEAD") && outranks(actor, target);
