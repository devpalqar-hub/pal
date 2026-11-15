export type WorkEv = { type: string; at: string };

/** Mirrors the server: sums worked and break seconds from the event log (open intervals run until `now`). */
export function calcWork(events: WorkEv[], now: number) {
  let work = 0, brk = 0, workFrom: number | null = null, pauseFrom: number | null = null;
  for (const e of events) {
    const t = new Date(e.at).getTime();
    if (e.type === "START" || e.type === "RESUME") { if (pauseFrom) brk += t - pauseFrom; pauseFrom = null; workFrom = t; }
    else if (e.type === "PAUSE") { if (workFrom) work += t - workFrom; workFrom = null; pauseFrom = t; }
    else if (e.type === "STOP") { if (workFrom) work += t - workFrom; workFrom = null; pauseFrom = null; }
  }
  if (workFrom) work += now - workFrom;
  if (pauseFrom) brk += now - pauseFrom;
  return { work: work / 1000, brk: brk / 1000 };
}
