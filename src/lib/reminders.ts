import { prisma } from "./prisma";
import { notify } from "./notify";
import { istLabel } from "./meetings";
import { loadMeetingForSync, remindGuests } from "./meeting-sync";

const LEAD_MS = 5 * 60_000;

/**
 * Runs every minute: "starts in 5 minutes" for meetings and "due in 5 minutes" for lead follow-ups.
 * Each item is claimed with a conditional update first, so a reminder is sent once even with several server instances.
 */
export async function sweepReminders(now = new Date()) {
  const soon = new Date(now.getTime() + LEAD_MS);

  const meetings = await prisma.meeting.findMany({
    where: { status: "SCHEDULED", reminderSentAt: null, startsAt: { gt: new Date(now.getTime() - 60_000), lte: soon } },
    select: { id: true },
  });
  for (const { id } of meetings) {
    const claimed = await prisma.meeting.updateMany({ where: { id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (!claimed.count) continue;
    const m = await loadMeetingForSync(id);
    const mins = Math.max(0, Math.round((m.startsAt.getTime() - now.getTime()) / 60_000));
    const when = mins ? `in ${mins} minute${mins === 1 ? "" : "s"}` : "now";
    const people = [m.organizerId, ...m.attendees.filter((a) => a.response !== "DECLINED").map((a) => a.userId)];
    for (const userId of new Set(people)) {
      await notify({
        userId, type: "MEETING_REMINDER", title: `Starts ${when}: ${m.title}`,
        body: `${istLabel(m.startsAt)}${m.lead ? ` · with ${m.lead.name}${m.lead.company ? ` (${m.lead.company})` : ""}` : ""}${m.link ? ` · ${m.link}` : ""}`,
        link: `/meetings?open=${m.id}`,
      });
    }
    await remindGuests(m);
  }

  const due = await prisma.leadFollowUp.findMany({
    where: { status: "PENDING", reminderSentAt: null, dueAt: { lte: soon } },
    include: { lead: { select: { id: true, name: true, company: true, phone: true, email: true } } },
    take: 500,
  });
  for (const f of due) {
    const claimed = await prisma.leadFollowUp.updateMany({ where: { id: f.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (!claimed.count) continue;
    const overdue = f.dueAt < new Date(now.getTime() - 60_000);
    const contact = f.type === "EMAIL" ? f.lead.email : f.lead.phone;
    await notify({
      userId: f.assigneeId, type: "LEAD_FOLLOW_UP_DUE",
      title: `${overdue ? "Overdue" : "Follow-up in 5 min"}: ${f.type.toLowerCase()} ${f.lead.name}${f.lead.company ? ` (${f.lead.company})` : ""}`,
      body: `${istLabel(f.dueAt)}${contact ? ` · ${contact}` : ""}${f.note ? ` — ${f.note}` : ""}`,
      link: `/leads/${f.lead.id}`,
    });
  }
  return { meetings: meetings.length, followUps: due.length };
}
