import type { Prisma } from "@prisma/client";

export const requestInclude = {
  requester: { select: { id: true, name: true, role: true, designation: true } },
  assignee: { select: { id: true, name: true, role: true, designation: true } },
  project: { select: { id: true, name: true } },
} satisfies Prisma.ServiceRequestInclude;
