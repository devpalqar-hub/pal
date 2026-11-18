/** All business time in PAL is India Standard Time (UTC+05:30, no DST). */
export const IST_TZ = "Asia/Kolkata";
const IST_OFFSET_MS = 330 * 60 * 1000;

/** Shifts a date so that its getUTC* fields read as IST wall-clock time. */
const shifted = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS);

/** IST calendar date as a UTC-midnight Date (for @db.Date columns). */
export function istDateKey(d = new Date()): Date {
  const i = shifted(d);
  return new Date(Date.UTC(i.getUTCFullYear(), i.getUTCMonth(), i.getUTCDate()));
}

export const istMinuteOfDay = (d: Date) => {
  const i = shifted(d);
  return i.getUTCHours() * 60 + i.getUTCMinutes();
};

export const istDateString = (d = new Date()) => istDateKey(d).toISOString().slice(0, 10);
export const istYear = (d = new Date()) => shifted(d).getUTCFullYear();

/** The instant when an IST wall-clock "HH:mm" occurs on the given IST calendar date (a UTC-midnight date key). */
export function istInstant(dateKey: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(dateKey.getTime() + (h * 60 + m) * 60_000 - IST_OFFSET_MS);
}
