export const initials = (name = "") =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "?";

export function fmtDuration(totalSeconds: number, withSeconds = false) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (withSeconds) return [h, m, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
  return h ? `${h}h ${m}m` : `${m}m`;
}
export const fmtMinutes = (m: number) => fmtDuration(m * 60);

/** All times are shown in India Standard Time. */
export const IST = "Asia/Kolkata";
export const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST }) : "—";
export const fmtTime = (d?: string | null) =>
  d ? new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: IST }) : "—";
/** Mail-style stamp: time if today (IST), otherwise short date. */
export function fmtMailDate(d?: string | null) {
  if (!d) return "";
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: IST });
  const dt = new Date(d);
  return day(dt) === day(new Date()) ? fmtTime(d) : dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: IST });
}
export const istHour = () => Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: IST }));
export const fmtDateTime = (d: string) => `${fmtDate(d)}, ${fmtTime(d)}`;

export const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  COMPANY_HEAD: "Company Head",
  MANAGER: "Manager",
  LEAD: "Team Lead",
  STAFF: "Staff",
};
export const ROLE_RANK: Record<string, number> = { SUPER_ADMIN: 100, COMPANY_HEAD: 80, MANAGER: 60, LEAD: 40, STAFF: 20 };
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const isoDate = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: IST }); // YYYY-MM-DD in IST

export const assignableRoles = (myRole: string) =>
  Object.keys(ROLE_RANK).filter((r) => myRole === "SUPER_ADMIN" || ROLE_RANK[r] < ROLE_RANK[myRole]);

/** "2026-11-20" + "15:30" typed in IST -> an ISO instant. */
export const istToIso = (date: string, time: string) => `${date}T${time}:00+05:30`;
/** ISO instant -> IST date ("YYYY-MM-DD") and time ("HH:mm") parts for form inputs. */
export function isoToIst(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-CA", { timeZone: IST }),
    time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: IST }),
  };
}
export const fmtDayHeading = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: IST });

/** Company-wide reference for tasks and requests, e.g. PAL-0012. */
export const fmtPalNo = (n?: number | null) => (n ? `PAL-${String(n).padStart(4, "0")}` : "");
/** "PAL-0012", "pal 12", "#12", "12" → 12; anything else → null. */
export function parsePalNo(q?: string | null): number | null {
  const m = q?.trim().match(/^(?:pal[\s\-_#]*|#)?0*(\d{1,9})$/i);
  return m ? Number(m[1]) : null;
}
/** Search box match: title contains the text, or the text is this item's PAL number. */
export function matchesQuery(item: { title: string; palNo?: number | null }, q: string) {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  if (item.title.toLowerCase().includes(t)) return true;
  const no = parsePalNo(t);
  if (no !== null && no === item.palNo) return true;
  // partial "PAL-00" style typing
  return t.startsWith("pal") && fmtPalNo(item.palNo).toLowerCase().startsWith(t.replace(/\s+/g, "-"));
}
