import { prisma } from "./prisma";
import { esc, getTransport } from "./notify";
import { istLabel } from "./meetings";
import { GoogleError, cancelEvent, upsertEvent } from "./google-calendar";

/**
 * Keeps people outside PAL in the loop:
 *  - organiser connected Google Calendar → the event lives in their calendar and Google emails every attendee;
 *  - otherwise → external guests get an email with an .ics invite (Outlook / Apple / Gmail all accept it).
 */
const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

const loadFull = (id: number) =>
  prisma.meeting.findUniqueOrThrow({
    where: { id },
    include: {
      organizer: { select: { id: true, name: true, email: true, mailEmail: true } },
      attendees: { include: { user: { select: { name: true, email: true, mailEmail: true } } } },
      guests: true,
      lead: { select: { name: true, company: true } },
    },
  });
type Full = Awaited<ReturnType<typeof loadFull>>;

export type CalendarResult = { google: "synced" | "failed" | "off"; error?: string; guestsEmailed?: number };

export async function syncMeeting(meetingId: number, opts: { useGoogle?: boolean; emailGuests?: string[] | "all" } = {}): Promise<CalendarResult> {
  const m = await loadFull(meetingId);
  if (opts.useGoogle !== false) {
    try {
      const ev = await upsertEvent({
        id: m.id, title: m.title, agenda: m.agenda, link: m.link, location: m.location, startsAt: m.startsAt, endsAt: m.endsAt,
        organizerId: m.organizerId, googleEventId: m.googleEventId,
        attendees: [
          ...m.attendees.filter((a) => a.response !== "DECLINED").map((a) => ({ email: a.user.mailEmail ?? a.user.email, name: a.user.name })),
          ...m.guests.map((g) => ({ email: g.email, name: g.name ?? g.email })),
        ],
      });
      if (ev) {
        await prisma.meeting.update({ where: { id: m.id }, data: { googleEventId: ev.eventId, googleHtmlLink: ev.htmlLink, ...(!m.link && ev.meetLink && { link: ev.meetLink }) } });
        return { google: "synced" };
      }
    } catch (e) {
      console.error("Google Calendar sync failed:", e);
      const error = e instanceof GoogleError ? e.message : "Google Calendar sync failed";
      // fall back to email so guests still get the invite
      const n = await emailGuests(await loadFull(meetingId), "REQUEST", opts.emailGuests ?? "all");
      return { google: "failed", error, guestsEmailed: n };
    }
  }
  const n = opts.emailGuests ? await emailGuests(m, "REQUEST", opts.emailGuests) : 0;
  return { google: "off", guestsEmailed: n };
}

/** Meeting cancelled: remove the Google event (Google notifies everyone), or email guests a cancellation. */
export async function cancelMeetingExternally(meetingId: number) {
  const m = await loadFull(meetingId);
  if (m.googleEventId) {
    try {
      if (await cancelEvent(m.organizerId, m.googleEventId)) return;
    } catch (e) { console.error("Google Calendar cancel failed:", e); }
  }
  await emailGuests(m, "CANCEL", "all");
}

/** Guests removed from a meeting that is not on Google: tell them it no longer includes them. */
export async function emailRemovedGuests(meetingId: number, emails: string[]) {
  if (!emails.length) return;
  const m = await loadFull(meetingId);
  if (m.googleEventId) return; // Google already told them
  const t = getTransport();
  if (!t) return;
  for (const to of emails) {
    await t.sendMail({ from: from(m), to, subject: `Cancelled: ${m.title}`, text: `The meeting "${m.title}" on ${istLabel(m.startsAt)} no longer includes you.`, icalEvent: { method: "CANCEL", content: ics(m, "CANCEL", [to]) } }).catch((e) => console.error("guest email failed:", e?.message));
  }
}

/** "Starts in 5 minutes" for external guests of meetings that are not on Google (Google reminds its own). */
export async function remindGuests(m: Full) {
  const t = getTransport();
  if (!t || m.googleEventId || !m.guests.length) return;
  for (const g of m.guests.filter((g) => g.response !== "DECLINED")) {
    await t.sendMail({
      from: from(m), to: g.email, subject: `Starting in 5 minutes: ${m.title}`,
      text: `Hi ${g.name ?? ""},\n\n"${m.title}" starts at ${istLabel(m.startsAt)}.${m.link ? `\nJoin: ${m.link}` : ""}${m.location ? `\nWhere: ${m.location}` : ""}\n\n— ${m.organizer.name}`,
      html: card(g.name, `<b>${esc(m.title)}</b> starts at ${esc(istLabel(m.startsAt))}.`, m),
    }).catch((e) => console.error("guest reminder failed:", e?.message));
  }
}
export { loadFull as loadMeetingForSync };

const from = (m: Full) => ({ name: `${m.organizer.name} via PAL`, address: process.env.NOTIFY_MAIL_USER! });

async function emailGuests(m: Full, method: "REQUEST" | "CANCEL", which: string[] | "all") {
  const t = getTransport();
  const guests = m.guests.filter((g) => which === "all" || which.includes(g.email));
  if (!t || !guests.length) return 0;
  let sent = 0;
  for (const g of guests) {
    const cancel = method === "CANCEL";
    try {
      await t.sendMail({
        from: from(m),
        replyTo: m.organizer.mailEmail ?? m.organizer.email,
        to: g.name ? { name: g.name, address: g.email } : g.email,
        subject: `${cancel ? "Cancelled" : "Invitation"}: ${m.title} — ${istLabel(m.startsAt)}`,
        text: `Hi ${g.name ?? ""},\n\n${cancel ? `${m.organizer.name} cancelled` : `${m.organizer.name} invited you to`} "${m.title}" on ${istLabel(m.startsAt)}.${!cancel && m.link ? `\nJoin: ${m.link}` : ""}${!cancel && m.location ? `\nWhere: ${m.location}` : ""}\n\nThe calendar invite is attached.`,
        html: card(g.name, cancel ? `${esc(m.organizer.name)} <b>cancelled</b> “${esc(m.title)}” planned for ${esc(istLabel(m.startsAt))}.` : `${esc(m.organizer.name)} invited you to <b>${esc(m.title)}</b> on ${esc(istLabel(m.startsAt))}.`, cancel ? null : m),
        icalEvent: { method, filename: "invite.ics", content: ics(m, method, [g.email]) },
      });
      sent++;
    } catch (e) {
      console.error("guest invite failed:", (e as Error)?.message);
    }
  }
  return sent;
}

function card(name: string | null, line: string, m: Full | null) {
  return `<div style="font:14px system-ui,sans-serif;color:#0f172a;max-width:520px"><p>Hi ${esc(name ?? "")},</p><p>${line}</p>${m?.location ? `<p>Where: ${esc(m.location)}</p>` : ""}${m?.link ? `<p><a href="${esc(m.link)}" style="background:#4f46e5;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none">Join meeting</a></p>` : ""}<p style="color:#64748b;font-size:12px">Add it to your calendar with the attached invite.</p></div>`;
}

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);

/** RFC 5545 invite. UID is stable per meeting so updates and cancellations replace the same calendar entry. */
function ics(m: Full, method: "REQUEST" | "CANCEL", to: string[]) {
  const org = m.organizer.mailEmail ?? m.organizer.email;
  const desc = [(m.agenda ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), m.link ? `Join: ${m.link}` : ""].filter(Boolean).join("\n\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PAL//Meetings//EN", `METHOD:${method}`, "BEGIN:VEVENT",
    `UID:pal-meeting-${m.id}@${new URL(appUrl()).hostname}`,
    `SEQUENCE:${Math.floor(m.updatedAt.getTime() / 1000) - 1_700_000_000}`,
    `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(m.startsAt)}`, `DTEND:${icsDate(m.endsAt)}`,
    `SUMMARY:${icsText(m.title)}`,
    ...(desc ? [`DESCRIPTION:${icsText(desc)}`] : []),
    ...(m.location || m.link ? [`LOCATION:${icsText(m.location ?? m.link!)}`] : []),
    ...(m.link ? [`URL:${m.link}`] : []),
    `ORGANIZER;CN=${icsText(m.organizer.name)}:mailto:${org}`,
    ...to.map((e) => `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${e}`),
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "BEGIN:VALARM", "TRIGGER:-PT5M", "ACTION:DISPLAY", "DESCRIPTION:Meeting in 5 minutes", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}
