import jwt from "jsonwebtoken";
import { prisma } from "./prisma";
import { decryptSecret, encryptSecret } from "./mail";

/**
 * Google Calendar via OAuth 2 (plain REST, no SDK).
 * Setup: create an OAuth client (Web application) in Google Cloud, enable the Google Calendar API, add
 * `${APP_URL}/api/integrations/google/callback` as an authorised redirect URI, and set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
 */
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];
const API = "https://www.googleapis.com/calendar/v3";

export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const redirectUri = () => process.env.GOOGLE_REDIRECT_URI ?? `${appUrl()}/api/integrations/google/callback`;
const stateSecret = () => process.env.JWT_SECRET ?? "";

export class GoogleError extends Error {}

/** Consent URL. `state` is a short-lived signed token naming the PAL user (the callback has no Bearer token). */
export function authUrl(userId: number) {
  const state = jwt.sign({ sub: userId, purpose: "google-calendar" }, stateSecret(), { expiresIn: "10m" });
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export function userFromState(state: string): number | null {
  try {
    const p = jwt.verify(state, stateSecret()) as unknown as { sub: number; purpose: string };
    return p.purpose === "google-calendar" ? p.sub : null;
  } catch {
    return null;
  }
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleError(data.error_description ?? data.error ?? `Google token error ${res.status}`);
  return data as { access_token: string; expires_in: number; refresh_token?: string };
}

/** Callback: exchange the code, look up the Google email and store the (encrypted) refresh token. */
export async function connectAccount(userId: number, code: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new GoogleError("Google did not return a refresh token — remove PAL from your Google account's third-party access and connect again.");
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${t.access_token}` } }).then((r) => r.json());
  const data = { email: String(info.email ?? "unknown"), refreshTokenEnc: encryptSecret(t.refresh_token), accessToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) };
  return prisma.googleAccount.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

export async function disconnectAccount(userId: number) {
  const acc = await prisma.googleAccount.findUnique({ where: { userId } });
  if (!acc) return;
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decryptSecret(acc.refreshTokenEnc))}`, { method: "POST" }).catch(() => {});
  await prisma.googleAccount.delete({ where: { userId } });
}

/** A valid access token for the user, refreshing when needed. null when not connected. */
async function accessToken(userId: number): Promise<{ token: string; calendarId: string } | null> {
  if (!googleConfigured()) return null;
  const acc = await prisma.googleAccount.findUnique({ where: { userId } });
  if (!acc) return null;
  if (acc.accessToken && acc.expiresAt && acc.expiresAt.getTime() > Date.now() + 60_000) return { token: acc.accessToken, calendarId: acc.calendarId };
  try {
    const t = await tokenRequest({ refresh_token: decryptSecret(acc.refreshTokenEnc), grant_type: "refresh_token" });
    await prisma.googleAccount.update({ where: { userId }, data: { accessToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) } });
    return { token: t.access_token, calendarId: acc.calendarId };
  } catch (e) {
    // access was revoked on Google's side: forget the connection so the UI asks to reconnect
    if (e instanceof GoogleError && /invalid_grant|revoked|expired/i.test(e.message)) await prisma.googleAccount.delete({ where: { userId } }).catch(() => {});
    throw e;
  }
}

export const isConnected = async (userId: number) => googleConfigured() && !!(await prisma.googleAccount.findUnique({ where: { userId }, select: { id: true } }));

export interface CalendarMeeting {
  id: number;
  title: string;
  agenda: string | null;
  link: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  organizerId: number;
  googleEventId: string | null;
  attendees: { email: string; name: string }[];
}

const plain = (html: string | null) => (html ?? "").replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

/**
 * Creates or updates the event in the organiser's calendar. Google emails every attendee (internal and external)
 * with accept / decline buttons. Adds a Google Meet link when the meeting has no link of its own.
 */
export async function upsertEvent(m: CalendarMeeting) {
  const auth = await accessToken(m.organizerId);
  if (!auth) return null;
  const body = {
    summary: m.title,
    description: [plain(m.agenda), m.link ? `Join: ${m.link}` : "", `PAL: ${appUrl()}/meetings?open=${m.id}`].filter(Boolean).join("\n\n"),
    location: m.location ?? m.link ?? undefined,
    start: { dateTime: m.startsAt.toISOString(), timeZone: "Asia/Kolkata" },
    end: { dateTime: m.endsAt.toISOString(), timeZone: "Asia/Kolkata" },
    attendees: m.attendees.map((a) => ({ email: a.email, displayName: a.name })),
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 5 }, { method: "email", minutes: 30 }] },
    extendedProperties: { private: { palMeetingId: String(m.id) } },
    ...(!m.link && !m.googleEventId && { conferenceData: { createRequest: { requestId: `pal-${m.id}-${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } } } }),
  };
  const url = `${API}/calendars/${encodeURIComponent(auth.calendarId)}/events${m.googleEventId ? `/${encodeURIComponent(m.googleEventId)}` : ""}?conferenceDataVersion=1&sendUpdates=all`;
  const res = await fetch(url, { method: m.googleEventId ? "PATCH" : "POST", headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleError(data.error?.message ?? `Google Calendar error ${res.status}`);
  return { eventId: data.id as string, htmlLink: data.htmlLink as string, meetLink: (data.hangoutLink as string | undefined) ?? null };
}

/** Deletes the event; Google tells every attendee it was cancelled. */
export async function cancelEvent(organizerId: number, eventId: string) {
  const auth = await accessToken(organizerId);
  if (!auth) return false;
  const res = await fetch(`${API}/calendars/${encodeURIComponent(auth.calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: "DELETE", headers: { authorization: `Bearer ${auth.token}` } });
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new GoogleError(`Google Calendar error ${res.status}`);
  return true;
}
