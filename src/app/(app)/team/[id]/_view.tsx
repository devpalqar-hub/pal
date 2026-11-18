"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PalNo } from "@/components/pal-no";
import { Search, LayoutDashboard, ListChecks, CalendarDays, UserRound, Mail, Briefcase, Clock, CalendarOff, FolderKanban } from "lucide-react";
import { api } from "@/lib/client/api";
import { DAY_NAMES, ROLE_LABEL, fmtDate, fmtDuration, fmtMinutes, fmtTime, isoDate, matchesQuery } from "@/lib/client/format";
import { Avatar, Empty, Loading, PageHeader, PriorityBadge, RoleBadge, StatusBadge, useToast } from "@/components/ui";
import { PRESENCE_COLORS, PRESENCE_LABELS, Ring, WeekBars, fmtH } from "@/components/charts";
import { CULTURE_TONE } from "../_view";

type Tab = "overview" | "tasks" | "attendance" | "profile";
const STATUS_GROUPS: [string, string, string[]][] = [["", "All", []], ["open", "Open", ["TODO", "IN_PROGRESS", "PAUSED"]], ["review", "In review", ["IN_REVIEW"]], ["done", "Done", ["COMPLETED", "ENDED"]]];

export default function MemberView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const [days, setDays] = useState(30);
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => { api(`/api/team/${id}?days=${days}`).then(setD).catch((e) => toast(e.message, true)); }, [id, days, toast]);

  if (!d) return <Loading />;
  const { user: u, taskSummary } = d;
  const tabs: [Tab, string, typeof Search][] = [["overview", "Overview", LayoutDashboard], ["tasks", `Tasks (${taskSummary.open} open)`, ListChecks], ["attendance", "Attendance", CalendarDays], ["profile", "Profile", UserRound]];

  return (
    <>
      <PageHeader crumbs={[{ label: "Team", href: "/team" }, { label: u.name }]} title={u.name} subtitle={u.email}
        actions={<>
          <RoleBadge role={u.role} designation={u.designation} />
          <select className="select" style={{ width: "auto" }} value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>
        </>} />
      <div className="tabs">{tabs.map(([k, l, I]) => <button key={k} className={`tab${tab === k ? " active" : ""}`} onClick={() => setTab(k)}><I size={14} style={{ verticalAlign: -2 }} /> {l}</button>)}</div>
      {tab === "overview" && <Overview d={d} />}
      {tab === "tasks" && <Tasks tasks={d.tasks} />}
      {tab === "attendance" && <Attendance rows={d.culture.rows} />}
      {tab === "profile" && <Profile d={d} />}
    </>
  );
}

function Overview({ d }: { d: any }) {
  const { user: u, today, culture: c } = d;
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
      <div className="grid grid-main" style={{ marginBottom: 16 }}>
        <div className="card card-pad" style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          <Ring value={c.score} max={100} size={120} color={CULTURE_TONE(c.score)}>
            <div className="ring-num">{c.score}</div><div className="ring-cap">{c.label}</div>
          </Ring>
          <div style={{ flex: 1, minWidth: 260 }}>
            <h3 style={{ marginBottom: 10 }}>Work culture · last {c.days} days</h3>
            <div className="grid grid-3" style={{ gap: 12 }}>
              {stats.map(([l, v, sub]) => <div key={l}><div className="kpi-cap">{l}</div><div className="kpi-num">{v}</div><div className="hint">{sub}</div></div>)}
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
          {d.tasks.find((t: any) => t.isRunning) && <p style={{ marginTop: 10, fontSize: 13 }}><span className="timer-dot" /> Working on <b>{d.tasks.find((t: any) => t.isRunning).title}</b></p>}
        </div>
      </div>
      <div className="card card-pad">
        <h3 style={{ marginBottom: 10 }}>Last 7 days</h3>
        <WeekBars target={c.requiredMinutes} days={week.map((r: any) => ({ label: DAY_NAMES[new Date(r.date).getUTCDay()], minutes: r.workedMinutes, sub: r.isLate ? "late" : r.onLeave ? "leave" : undefined, muted: !r.isWorkingDay || r.onLeave }))} />
      </div>
    </>
  );
}

function Tasks({ tasks }: { tasks: any[] }) {
  const router = useRouter();
  const [f, setF] = useState({ q: "", status: "open", project: "", priority: "", overdue: false, running: false, sort: "due" });
  const projects = useMemo(() => [...new Map(tasks.map((t) => [t.project.id, t.project])).values()], [tasks]);
  const shown = useMemo(() => {
    const group = STATUS_GROUPS.find(([k]) => k === f.status)![2];
    const rank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return tasks
      .filter((t) => (!group.length || group.includes(t.status)) && (!f.project || String(t.project.id) === f.project) && (!f.priority || t.priority === f.priority)
        && (!f.overdue || t.overdue) && (!f.running || t.isRunning) && matchesQuery(t, f.q))
      .sort((a, b) => {
        if (f.sort === "priority") return rank[a.priority] - rank[b.priority];
        if (f.sort === "time") return b.workedSeconds - a.workedSeconds;
        return (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity);
      });
  }, [tasks, f]);
  const total = shown.reduce((n, t) => n + t.workedSeconds, 0);

  return (
    <>
      <div className="toolbar">
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: 11, color: "var(--muted)" }} />
          <input className="input" style={{ paddingLeft: 32, width: "100%" }} placeholder="Search title or PAL-0012…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        </div>
        <div className="seg">{STATUS_GROUPS.map(([k, l]) => <button key={k} className={f.status === k ? "on" : ""} onClick={() => setF({ ...f, status: k })}>{l}</button>)}</div>
        <select className="select" value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })}><option value="">All projects</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select className="select" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="">Any priority</option>{["URGENT", "HIGH", "MEDIUM", "LOW"].map((p) => <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>)}</select>
        <select className="select" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}><option value="due">Sort: due date</option><option value="priority">Sort: priority</option><option value="time">Sort: time spent</option></select>
        <label className="chip" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={f.overdue} onChange={(e) => setF({ ...f, overdue: e.target.checked })} /> Overdue only</label>
        <label className="chip" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={f.running} onChange={(e) => setF({ ...f, running: e.target.checked })} /> Running now</label>
      </div>
      <div className="card">
        <div className="card-head"><h3>{shown.length} task{shown.length === 1 ? "" : "s"}</h3><span className="hint">{fmtDuration(total)} logged</span></div>
        {shown.length === 0 ? <Empty title="No tasks match these filters" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>No.</th><th>Task</th><th>Project</th><th>Status</th><th>Priority</th><th>Due</th><th>Time</th></tr></thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id} className="click" onClick={() => router.push(`/tasks?open=${t.id}`)}>
                  <td><PalNo n={t.palNo} /></td>
                  <td style={{ fontWeight: 600 }}>{t.isRunning && <span className="timer-dot" style={{ marginRight: 6 }} />}{t.title}</td>
                  <td><Link href={`/projects/${t.project.id}`} onClick={(e) => e.stopPropagation()} style={{ color: "var(--primary)" }}>{t.project.name}</Link></td>
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
    </>
  );
}

function Attendance({ rows }: { rows: any[] }) {
  const first = rows[0]?.date ?? isoDate();
  const last = rows[rows.length - 1]?.date ?? isoDate();
  const [f, setF] = useState({ from: first, to: last, show: "", workingOnly: true });
  useEffect(() => setF((s) => ({ ...s, from: first, to: last })), [first, last]);
  const shown = [...rows].reverse().filter((r) => r.date >= f.from && r.date <= f.to && (!f.workingOnly || r.isWorkingDay || r.workedMinutes > 0)
    && (!f.show || (f.show === "late" && r.isLate) || (f.show === "early" && r.earlyMinutes > 0) || (f.show === "absent" && r.isWorkingDay && !r.onLeave && !r.workedMinutes) || (f.show === "leave" && r.onLeave) || (f.show === "full" && r.status === "PRESENT")));
  const worked = shown.reduce((n, r) => n + r.workedMinutes, 0);
  const present = shown.filter((r) => r.workedMinutes > 0).length;

  return (
    <>
      <div className="toolbar">
        <label className="hint">From <input type="date" className="input" min={first} max={f.to} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label className="hint">To <input type="date" className="input" min={f.from} max={last} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        <select className="select" value={f.show} onChange={(e) => setF({ ...f, show: e.target.value })}>
          <option value="">All days</option><option value="late">Late arrivals</option><option value="early">Early check-outs</option><option value="absent">Absent (no record)</option><option value="leave">On leave</option><option value="full">Full days</option>
        </select>
        <label className="chip" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={f.workingOnly} onChange={(e) => setF({ ...f, workingOnly: e.target.checked })} /> Working days only</label>
      </div>
      <div className="card">
        <div className="card-head"><h3>{shown.length} day{shown.length === 1 ? "" : "s"}</h3><span className="hint">{present} worked · {fmtH(worked)} total{present ? ` · ${fmtH(Math.round(worked / present))} avg` : ""}</span></div>
        {shown.length === 0 ? <Empty title="No days match these filters" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Worked</th><th>Break</th><th>Status</th><th>Punctuality</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.date}>
                  <td>{fmtDate(r.date)} <span className="hint">{DAY_NAMES[new Date(r.date).getUTCDay()]}</span></td>
                  <td>{fmtTime(r.firstStartAt)}</td><td>{fmtTime(r.lastStopAt)}</td>
                  <td>{r.workedMinutes ? fmtH(r.workedMinutes) : "—"}</td><td>{r.breakMinutes ? fmtH(r.breakMinutes) : "—"}</td>
                  <td>{r.onLeave ? <span className="badge b-purple">On leave</span> : r.status ? <StatusBadge status={r.status} /> : r.isWorkingDay ? <span className="badge b-gray">No record</span> : <span className="hint">Day off</span>}</td>
                  <td>{r.isLate ? <span className="badge b-red">Late {r.lateMinutes}m</span> : r.firstStartAt ? <span className="badge b-green">On time</span> : "—"}{r.earlyMinutes > 0 && <span className="badge b-amber" style={{ marginLeft: 6 }}>Left {r.earlyMinutes}m early</span>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}

function Profile({ d }: { d: any }) {
  const { user: u, profile: p, culture: c } = d;
  const s = u.schedule;
  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="card card-pad">
        <div className="user-cell" style={{ marginBottom: 16 }}>
          <Avatar name={u.name} />
          <div><div style={{ fontWeight: 650, fontSize: 16 }}>{u.name}</div><div className="sub">{u.designation || ROLE_LABEL[u.role]}</div></div>
          <span className="push">{u.isActive ? <span className="badge b-green">Active</span> : <span className="badge b-gray">Inactive</span>}</span>
        </div>
        <dl className="kv">
          <dt><Mail size={13} /> Login email</dt><dd>{u.email}</dd>
          {u.mailEmail && <><dt><Mail size={13} /> Mailbox</dt><dd><a href={`mailto:${u.mailEmail}`} style={{ color: "var(--primary)" }}>{u.mailEmail}</a></dd></>}
          <dt><Briefcase size={13} /> Role</dt><dd>{ROLE_LABEL[u.role]}{u.designation ? ` · ${u.designation}` : ""}</dd>
          <dt>Joined</dt><dd>{fmtDate(u.createdAt)}</dd>
          <dt>Culture score</dt><dd><b style={{ color: CULTURE_TONE(c.score) }}>{c.score}</b> · {c.label}</dd>
          <dt>Tasks</dt><dd>{p.lifetime.done} done of {p.lifetime.tasks} · {fmtDuration(p.lifetime.loggedSeconds)} logged</dd>
        </dl>
      </div>

      <div className="card card-pad">
        <h3 style={{ marginBottom: 12 }}><Clock size={15} style={{ verticalAlign: -2 }} /> Work schedule</h3>
        {s ? (
          <dl className="kv">
            <dt>Shift</dt><dd>{s.startTime} – {s.endTime} IST</dd>
            <dt>Working days</dt><dd>{(s.workingDays as number[]).map((x) => DAY_NAMES[x]).join(", ")}</dd>
            <dt>Daily target</dt><dd>{fmtMinutes(s.requiredMinutes)} (half day {fmtMinutes(s.halfDayMinutes)})</dd>
            <dt>Grace</dt><dd>{s.lateGraceMinutes}m late · {s.earlyGraceMinutes}m early</dd>
          </dl>
        ) : <p className="hint">No schedule set.</p>}
        <h3 style={{ margin: "18px 0 12px" }}><CalendarOff size={15} style={{ verticalAlign: -2 }} /> Leave {p.leave.year}</h3>
        <dl className="kv">
          <dt>Paid leave</dt><dd>{p.leave.remaining} left of {p.leave.totalPaidLeaves} ({p.leave.used} used{p.leave.pending ? `, ${p.leave.pending} pending` : ""})</dd>
          <dt>Coming up</dt><dd>{p.upcomingLeave.length ? p.upcomingLeave.map((l: any) => <div key={l.id}>{fmtDate(l.startDate)}{l.endDate !== l.startDate ? ` – ${fmtDate(l.endDate)}` : ""} · {l.days}d {l.type.toLowerCase()}{l.status === "PENDING" ? " (pending)" : ""}</div>) : "—"}</dd>
        </dl>
      </div>

      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="card-head"><h3><FolderKanban size={15} style={{ verticalAlign: -2 }} /> Projects ({p.projects.length})</h3></div>
        {p.projects.length === 0 ? <Empty title="Not in any project" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Project</th><th>Status</th><th>Role</th><th>Due</th><th>Member since</th></tr></thead>
            <tbody>{p.projects.map((x: any) => (
              <tr key={x.id}>
                <td><Link href={`/projects/${x.id}`} style={{ fontWeight: 600, color: "var(--primary)" }}>{x.name}</Link></td>
                <td><StatusBadge status={x.status} /></td>
                <td>{x.projectRole === "OWNER" ? <span className="badge b-purple">Owner</span> : "Member"}</td>
                <td>{fmtDate(x.dueDate)}</td><td>{fmtDate(x.joinedAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
