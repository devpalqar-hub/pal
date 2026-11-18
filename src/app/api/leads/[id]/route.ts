import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody } from "@/lib/http";
import { badRequest, forbidden } from "@/lib/auth";
import { updateLeadSchema } from "@/lib/validation";
import { notify } from "@/lib/notify";
import { meetingInclude } from "@/lib/meetings";
import { activeUser, leadCtx, seesAllLeads } from "@/lib/leads";

type P = { id: string };

/** Full lead: details, journey (activities), follow-ups and meetings. */
export const GET = authed<P>(async (_req, actor, { id }) => {
  const ctx = await leadCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: ctx.lead.id },
    include: {
      owner: { select: { id: true, name: true, role: true, designation: true } },
      creator: { select: { id: true, name: true } },
      activities: { include: { actor: { select: { id: true, name: true } } }, orderBy: { at: "desc" } },
      followUps: { include: { assignee: { select: { id: true, name: true } } }, orderBy: [{ status: "asc" }, { dueAt: "asc" }] },
      meetings: { include: meetingInclude, orderBy: { startsAt: "desc" } },
    },
  });
  return NextResponse.json({ lead, canManage: ctx.canManage, canDelete: seesAllLeads(actor.role) });
});

/** Edit details / reassign owner (owner, creator, MANAGER+). */
export const PATCH = authed<P>(async (req, actor, { id }) => {
  const ctx = await leadCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canManage) return forbidden();
  const body = await parseBody(req, updateLeadSchema);
  if ("error" in body) return body.error;
  const { ownerId, ...data } = body.data;
  const old = ctx.lead;

  const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => data[k] !== undefined && String(data[k] ?? "") !== String(old[k] ?? ""));
  const ownerChanged = ownerId !== undefined && ownerId !== old.ownerId;
  let newOwner: { id: number; name: string } | null = null;
  if (ownerChanged) {
    newOwner = await activeUser(ownerId!);
    if (!newOwner) return badRequest("Owner not found");
  }
  const oldOwner = ownerChanged ? await prisma.user.findUnique({ where: { id: old.ownerId }, select: { name: true } }) : null;

  const lead = await prisma.lead.update({
    where: { id: old.id },
    data: {
      ...data, ...(ownerChanged && { ownerId }), lastActivityAt: new Date(),
      activities: {
        create: [
          ...(changed.length ? [{ type: "UPDATED" as const, actorId: actor.id, note: `Updated ${changed.join(", ")}` }] : []),
          ...(ownerChanged ? [{ type: "OWNER_CHANGED" as const, actorId: actor.id, fromValue: oldOwner?.name ?? null, toValue: newOwner!.name }] : []),
        ],
      },
    },
  });
  if (ownerChanged && ownerId !== actor.id) await notify({ userId: ownerId!, type: "LEAD_ASSIGNED", title: `Lead assigned to you: ${lead.name}`, body: `${actor.name} made you the owner.`, link: `/leads/${lead.id}` });
  return NextResponse.json({ lead });
});

/** Delete: lead owner's managers (MANAGER+) only. Keeps meetings (unlinked). */
export const DELETE = authed<P>(async (_req, actor, { id }) => {
  const ctx = await leadCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  if (!seesAllLeads(actor.role)) return forbidden();
  await prisma.lead.delete({ where: { id: ctx.lead.id } });
  return NextResponse.json({ ok: true });
});
