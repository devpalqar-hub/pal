"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { Play, Pause, Square, Coffee, LogIn } from "lucide-react";
import { api } from "@/lib/client/api";
import { calcWork } from "@/lib/client/attendance-calc";
import { fmtDuration, fmtTime } from "@/lib/client/format";
import { Ring, fmtH } from "./charts";
import { Spinner, useToast } from "./ui";

const STATE: Record<string, [string, string]> = {
  NOT_STARTED: ["Not checked in", "b-gray"],
  WORKING: ["Working", "b-green"],
  PAUSED: ["On break", "b-amber"],
  STOPPED: ["Checked out", "b-blue"],
};

/** "My day": progress ring against the daily target + start / break / end controls. Ticks locally. */
function WorkDayCardImpl({ requiredMinutes = 480, schedule, onChange }: { requiredMinutes?: number; schedule?: { startTime: string; endTime: string } | null; onChange?: () => void }) {
  const toast = useToast();
  const [today, setToday] = useState<any>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api("/api/attendance/today").then(setToday), []);
  useEffect(() => { load(); }, [load]);
  const running = today?.state === "WORKING" || today?.state === "PAUSED";
  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [running]);

  // Reload right after the shift end time so the server's automatic pause (and the task timers it stops) shows up.
  const state0: string | undefined = today?.state;
  useEffect(() => {
    if (state0 !== "WORKING" || !schedule?.endTime) return;
    const [h, m] = schedule.endTime.split(":").map(Number);
    const istNow = new Date(Date.now() + 330 * 60_000);
    const msLeft = ((h * 60 + m) - (istNow.getUTCHours() * 60 + istNow.getUTCMinutes())) * 60_000 - istNow.getUTCSeconds() * 1000;
    if (msLeft <= 0) return;
    const t = setTimeout(() => { load().then(() => onChange?.()); }, msLeft + 2000);
    return () => clearTimeout(t);
  }, [state0, schedule?.endTime, load, onChange]);

  async function act(action: string) {
    setBusy(true);
    try { await api(`/api/attendance/${action}`, { method: "POST" }); await load(); setNow(Date.now()); onChange?.(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
    finally { setBusy(false); }
  }

  if (!today) return <div className="card card-pad"><Spinner /></div>;
  const state: string = today.state;
  const a = today.attendance;
  const events = a?.events ?? [];
  const { work, brk } = calcWork(events, now);
  const first = events.find((e: any) => e.type === "START");
  const [label, tone] = STATE[state];
  const pct = Math.round(Math.min(1, work / 60 / requiredMinutes) * 100);
  const left = Math.max(0, requiredMinutes - work / 60);

  return (
    <div className="card dash-card">
      <div className="dc-head"><h3>My day</h3><span className={`badge ${tone}`}>{state === "WORKING" && <span className="timer-dot" />}{label}</span></div>
      <div className="myday">
        <Ring value={work / 60} max={requiredMinutes} size={112} color={pct >= 100 ? "#10b981" : "var(--primary)"}>
          <div className="ring-num" style={{ fontSize: 18 }}>{fmtDuration(work, true).slice(0, 5)}</div>
          <div className="ring-cap">{pct}% of {fmtH(requiredMinutes)}</div>
        </Ring>
        <dl className="myday-facts">
          <dt><LogIn size={13} /> In</dt><dd>{first ? fmtTime(first.at) : "—"}{a?.isLate && <span className="badge b-red" style={{ marginLeft: 6 }}>Late {a.lateMinutes}m</span>}</dd>
          <dt><Coffee size={13} /> Break</dt><dd>{fmtDuration(brk)}</dd>
          <dt>Left</dt><dd>{pct >= 100 ? <span style={{ color: "var(--success)", fontWeight: 600 }}>Target met</span> : fmtH(left)}</dd>
          {schedule && <><dt>Shift</dt><dd>{schedule.startTime}–{schedule.endTime}</dd></>}
        </dl>
      </div>
      {state === "PAUSED" && events[events.length - 1]?.auto && <p className="hint" style={{ marginTop: 10 }}>Paused automatically at the end of your shift — task timers were paused too. Resume to keep working.</p>}
      {state === "PAUSED" && !events[events.length - 1]?.auto && <p className="hint" style={{ marginTop: 10 }}>Your task timers are paused while the day timer is paused.</p>}
      <div className="actions" style={{ marginTop: 12 }}>
        {(state === "NOT_STARTED" || state === "STOPPED") && <button className="btn btn-primary btn-sm grow-btn" disabled={busy} onClick={() => act("start")}><Play size={14} /> {state === "STOPPED" ? "Start again" : "Start my day"}</button>}
        {state === "WORKING" && <button className="btn btn-sm grow-btn" disabled={busy} onClick={() => act("pause")}><Coffee size={14} /> Take a break</button>}
        {state === "PAUSED" && <button className="btn btn-primary btn-sm grow-btn" disabled={busy} onClick={() => act("resume")}><Pause size={14} /> Resume</button>}
        {running && <button className="btn btn-danger btn-sm grow-btn" disabled={busy} onClick={() => act("stop")}><Square size={14} /> End day</button>}
      </div>
    </div>
  );
}
export const WorkDayCard = memo(WorkDayCardImpl);
