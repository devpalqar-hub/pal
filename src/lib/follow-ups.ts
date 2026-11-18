import type { z } from "zod";
import { prisma } from "./prisma";
import { notify } from "./notify";
import { istLabel } from "./meetings";
import { activeUser, touchLead } from "./leads";
import type { followUpSchema } from "./validation";

/** Schedules a follow-up on a lead, logs it in the journey and tells the assignee. Returns an error message or the row. */
export async function scheduleFollowUp(lead: { id: number; name: string; ownerId: number }, f: z.infer<typeof followUpSchema>, actor: { id: number; name: string }) {
  const assigneeId = f.assigneeId ?? lead.ownerId;
  if (!(await activeUser(assigneeId))) return { error: "Follow-up assignee not found" };
  const dueAt = new Date(f.dueAt);
  const row = await prisma.leadFollowUp.create({
    data: { leadId: lead.id, type: f.type, dueAt, note: f.note, assigneeId, createdById: actor.id },
    include: { assignee: { select: { id: true, name: true } } },
  });
  await prisma.leadActivity.create({ data: { leadId: lead.id, actorId: actor.id, type: "FOLLOW_UP_SCHEDULED", toValue: dueAt.toISOString(), note: `${f.type.toLowerCase()} for ${row.assignee.name}${f.note ? ` — ${f.note}` : ""}` } });
  await touchLead(lead.id);
  if (assigneeId !== actor.id) {
    await notify({ userId: assigneeId, type: "LEAD_FOLLOW_UP_ASSIGNED", title: `Follow-up: ${lead.name}`, body: `${actor.name} asked you to ${f.type.toLowerCase()} — ${istLabel(dueAt)}.`, link: `/leads/${lead.id}` });
  }
  return { followUp: row };
}
