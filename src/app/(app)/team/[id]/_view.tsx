"use client";

import { use, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { DAY_NAMES, fmtDate, fmtDuration, fmtMinutes, fmtTime } from "@/lib/client/format";
import { Empty, Loading, PageHeader, PriorityBadge, RoleBadge, StatusBadge, useToast } from "@/components/ui";
import { PRESENCE_COLORS, PRESENCE_LABELS, Ring, WeekBars, fmtH } from "@/components/charts";
import { CULTURE_TONE } from "../_view";

const FILTERS: [string, string[]][] = [["All", []], ["Open", ["TODO", "IN_PROGRESS", "PAUSED"]], ["In review", ["IN_REVIEW"]], ["Done", ["COMPLETED", "ENDED"]]];

export default function MemberView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const [days, setDays] = useState(30);
  const [d, setD] = useState<any>(null);
  const [filter, setFilter] = useState(1);
  useEffect(() => { api(`/api/team/${id}?days=${days}`).then(setD).catch((e) => toast(e.message, true)); }, [id, days, toast]);

  if (!d) return <Loading />;
  const { user: u, today, culture: c, tasks, taskSummary } = d;
  const shown = tasks.filter((t: any) => !FILTERS[filter][1].length || FILTERS[filter][1].includes(t.status));
  const week = c.rows.slice(-7);
  const stats: [string, string, string?][] = [
    ["Attendance", `${c.attendanceRate}%`, `${c.expectedDays - c.absentDays} of ${c.expectedDays} working days`],
    ["Punctuality", `${c.punctuality}%`, `${c.lateDays} late arrival${c.lateDays === 1 ? "" : "s"}`],
    ["Daily target met", `${c.targetMet}%`, `target ${fmtMinutes(c.requiredMinutes)}`],
    ["Avg worked / day", fmtH(c.avgWorkMinutes), `${fmtH(c.avgBreakMinutes)} avg break`],
    ["Tasks on time", c.onTimeTasks === null ? "—" : `${c.onTimeTasks}%`, `${c.tasksDone} finished`],
    ["Early check-outs", String(c.earlyCheckouts), "left before shift end"],
  ];

  return (
    <>
      <PageHeader crumbs={[{ label: "Team", href: "/team" }, { label: u.name }]} title={u.name} subtitle={u.email} actions={<RoleBadge role={u.role} designation={u.designation} />} />

      <div className="grid grid-main" style={{ marginBottom: 16 }}>
        <div className="card card-pad" style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          <Ring value={c.score} max={100} size={120} color={CULTURE_TONE(c.score)}>
            <div className="ring-num">{c.score}</div><div className="ring-cap">{c.label}</div>
          </Ring>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3>Work culture</h3>
              <select className="select" style={{ width: "auto" }} value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>
            </div>
            <div className="grid grid-3" style={{ gap: 12 }}>
              {stats.map(([l, v, sub]) => (
                <div key={l}><div className="kpi-cap">{l}</div><div className="kpi-num">{v}</div><div className="hint">{sub}</div></div>
              ))}
            </div>
          </div>
        </div>
        <div className="card card-pad">
          <h3 style={{ marginBottom: 10 }}>Right now</h3>
          <span className="badge" style={{ background: PRESENCE_COLORS[today.state] + "26" }}>{today.state === "WORKING" && <span className="timer-dot" />}{PRESENCE_LABELS[today.state]}</span>
          <dl className="kv" style={{ marginTop: 12 }}>
            <dt>Checked in</dt><dd>{today.firstStartAt ? fmtTime(today.firstStartAt) : "—"}{today.isLate && <span className="badge b-red" style={{ marginLeft: 6 }}>Late</span>}</dd>
            <dt>Worked today</dt><dd>{fmtH(today.workedMinutes)}</dd>
            <dt>Breaks today</dt><dd>{fmtH(today.breakMinutes)}</dd>
            {u.schedule && <><dt>Shift</dt><dd>{u.schedule.startTime}–{u.schedule.endTime}</dd></>}
          </dl>
          {today.autoPaused && today.state === "PAUSED" && <p className="hint" style={{ marginTop: 8 }}>Paused automatically when the shift ended.</p>}
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 10 }}>Last 7 days</h3>
        <WeekBars target={c.requiredMinutes} days={week.map((r: any) => ({ label: DAY_NAMES[new Date(r.date).getUTCDay()], minutes: r.workedMinutes, sub: r.isLate ? "late" : r.onLeave ? "leave" : undefined, muted: !r.isWorkingDay || r.onLeave }))} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>Tasks ({taskSummary.open} open{taskSummary.overdue ? `, ${taskSummary.overdue} overdue` : ""})</h3>
          <div className="actions">{FILTERS.map(([l], i) => <button key={l} className={`btn btn-sm${filter === i ? " btn-primary" : ""}`} onClick={() => setFilter(i)}>{l}</button>)}</div>
        </div>
        {shown.length === 0 ? <Empty title="No tasks here" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Task</th><th>Project</th><th>Status</th><th>Priority</th><th>Due</th><th>Time</th></tr></thead>
            <tbody>
              {shown.map((t: any) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.isRunning && <span className="timer-dot" style={{ marginRight: 6 }} />}{t.title}</td>
                  <td>{t.project.name}</td>
                  <td><StatusBadge status={t.status} />{t.overdue && <span className="badge b-red" style={{ marginLeft: 6 }}>Overdue</span>}</td>
                  <td><PriorityBadge priority={t.priority} /></td>
                  <td>{fmtDate(t.dueDate)}</td>
                  <td>{fmtDuration(t.workedSeconds)}{t.estimatedMinutes ? <span className="hint"> / {fmtMinutes(t.estimatedMinutes)}</span> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h3>Daily log</h3></div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Worked</th><th>Break</th><th>Status</th><th>Punctuality</th></tr></thead>
          <tbody>
            {[...c.rows].reverse().filter((r: any) => r.isWorkingDay || r.workedMinutes > 0).map((r: any) => (
              <tr key={r.date}>
                <td>{fmtDate(r.date)}</td>
                <td>{fmtTime(r.firstStartAt)}</td><td>{fmtTime(r.lastStopAt)}</td>
                <td>{r.workedMinutes ? fmtH(r.workedMinutes) : "—"}</td><td>{r.breakMinutes ? fmtH(r.breakMinutes) : "—"}</td>
                <td>{r.onLeave ? <span className="badge b-purple">On leave</span> : r.status ? <StatusBadge status={r.status} /> : <span className="badge b-gray">No record</span>}</td>
                <td>{r.isLate ? <span className="badge b-red">Late {r.lateMinutes}m</span> : r.firstStartAt ? <span className="badge b-green">On time</span> : "—"}{r.earlyMinutes > 0 && <span className="badge b-amber" style={{ marginLeft: 6 }}>Left {r.earlyMinutes}m early</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </>
  );
}
