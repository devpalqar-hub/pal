/**
 * Background jobs, every minute (Node runtime only):
 *  - shift end: pause day timers (and their task timers) when a shift ends;
 *  - reminders: meetings starting and lead follow-ups due in 5 minutes.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as { __palJobs?: boolean };
  if (g.__palJobs) return;
  g.__palJobs = true;
  const [{ sweepShiftEnds }, { sweepReminders }] = await Promise.all([import("./lib/day-timer"), import("./lib/reminders")]);
  const tick = () => {
    sweepShiftEnds().catch((e) => console.error("shift-end sweep failed", e));
    sweepReminders().catch((e) => console.error("reminder sweep failed", e));
  };
  setInterval(tick, 60_000).unref();
  setTimeout(tick, 5_000).unref();
}
