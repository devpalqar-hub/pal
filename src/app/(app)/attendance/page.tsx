"use client";

import { useCallback, useEffect, useState } from "react";
import { Play, Pause, Square, Coffee, LogIn, LogOut } from "lucide-react";
import { api } from "@/lib/client/api";
import { fmtDate, fmtDuration, fmtMinutes, fmtTime } from "@/lib/client/format";
import { calcWork as calc, type WorkEv } from "@/lib/client/attendance-calc";
import { Empty, Loading, PageHeader, StatusBadge, useToast } from "@/components/ui";

type Ev = WorkEv;

export default function AttendancePage() {
  const toast = useToast();
  const [today, setToday] = useState<any>(null);
  const [days, setDays] = useState<any[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [t, h] = await Promise.all([api("/api/attendance/today"), api("/api/attendance")]);
    setToday(t);
    setDays(h.days);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  async function act(action: string) {
    setBusy(true);
    try { await api(`/api/attendance/${action}`, { method: "POST" }); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
    finally { setBusy(false); }
  }

  if (!today || !days) return <Loading />;
  const state: string = today.state;
  const events: Ev[] = today.attendance?.events ?? [];
  const { work, brk } = calc(events, now);
  const first = events.find((e) => e.type === "START");
  const stop = state === "STOPPED" ? events[events.length - 1] : null;
  const a = today.attendance;

  const label: Record<string, string> = { NOT_STARTED: "Ready to start your day", WORKING: "You’re on the clock", PAUSED: "You’re on a break", STOPPED: "Day complete" };

  return (
    <>
      <PageHeader title="Attendance" subtitle="Track your working hours (all times in IST). Your day is marked automatically from the time you log." />

      <div className="grid grid-main" style={{ marginBottom: 24 }}>
        <div className="card card-pad" style={{ textAlign: "center", padding: 40 }}>
          <div className="hint" style={{ marginBottom: 6 }}>{label[state]}</div>
          <div className="clock">{fmtDuration(work, true)}</div>
          <div className="hint" style={{ margin: "6px 0 26px" }}>Break time: {fmtDuration(brk)}</div>

          <div className="actions" style={{ justifyContent: "center" }}>
            {(state === "NOT_STARTED" || state === "STOPPED") && (
              <button className="btn btn-primary" disabled={busy} onClick={() => act("start")}><Play size={16} /> {state === "STOPPED" ? "Start again" : "Start day"}</button>
            )}
            {state === "WORKING" && <button className="btn" disabled={busy} onClick={() => act("pause")}><Coffee size={16} /> Take a break</button>}
            {state === "PAUSED" && <button className="btn btn-primary" disabled={busy} onClick={() => act("resume")}><Pause size={16} /> Resume</button>}
            {(state === "WORKING" || state === "PAUSED") && <button className="btn btn-danger" disabled={busy} onClick={() => act("stop")}><Square size={16} /> End day</button>}
          </div>
        </div>

        <div className="card card-pad">
          <h3 style={{ marginBottom: 14 }}>Today</h3>
          <dl className="kv" style={{ gridTemplateColumns: "120px 1fr" }}>
            <dt><LogIn size={14} style={{ verticalAlign: -2 }} /> Check-in</dt><dd>{fmtTime(first?.at)}</dd>
            <dt><LogOut size={14} style={{ verticalAlign: -2 }} /> Check-out</dt><dd>{fmtTime(stop?.at)}</dd>
            <dt>Status</dt><dd>{a ? <StatusBadge status={a.status} /> : "—"}</dd>
            <dt>Arrival</dt><dd>{a ? (a.isLate ? <span className="badge b-red">Late by {a.lateMinutes}m</span> : <span className="badge b-green">On time</span>) : "—"}</dd>
            <dt>Departure</dt><dd>{stop ? (a.isEarlyCheckout ? <span className="badge b-amber">Early by {a.earlyMinutes}m</span> : <span className="badge b-green">Full day</span>) : "—"}</dd>
          </dl>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>History</h3></div>
        {days.length === 0 ? <Empty title="No attendance yet" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Worked</th><th>Break</th><th>Status</th><th>Flags</th></tr></thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 600 }}>{fmtDate(d.date)}</td>
                  <td>{fmtTime(d.firstStartAt)}</td><td>{fmtTime(d.lastStopAt)}</td>
                  <td>{fmtMinutes(d.totalWorkMinutes)}</td><td>{fmtMinutes(d.totalBreakMinutes)}</td>
                  <td><StatusBadge status={d.status} /></td>
                  <td className="actions">
                    {d.isLate && <span className="badge b-red">Late {d.lateMinutes}m</span>}
                    {d.isEarlyCheckout && <span className="badge b-amber">Early {d.earlyMinutes}m</span>}
                    {!d.isLate && !d.isEarlyCheckout && "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
