"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Users, FolderKanban, AlertTriangle, Clock } from "lucide-react";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { fmtDate, fmtTime, DAY_NAMES, ROLE_LABEL, ROLE_RANK } from "@/lib/client/format";
import { Avatar, Empty, Loading, PageHeader } from "@/components/ui";
import { Bar, MiniBars, PRESENCE_COLORS, PRESENCE_LABELS, StackBar, TASK_COLORS, TASK_LABELS, fmtH, taskBuckets } from "@/components/charts";
import { HEALTH } from "@/components/dashboard-widgets";

export default function AnalyticsPage() {
  const { user } = useAuth();
  const params = useSearchParams();
  const canTeam = ROLE_RANK[user!.role] >= ROLE_RANK.MANAGER;
  const [tab, setTab] = useState<"team" | "projects">(params.get("tab") === "projects" || !canTeam ? "projects" : "team");

  return (
    <>
      <PageHeader title="Analytics" subtitle={canTeam ? "How your PALs and projects are doing — live, in IST." : "How your projects are doing."} />
      {canTeam && (
        <div className="tabs">
          <button className={`tab${tab === "team" ? " active" : ""}`} onClick={() => setTab("team")}><Users size={14} style={{ verticalAlign: -2 }} /> Team</button>
          <button className={`tab${tab === "projects" ? " active" : ""}`} onClick={() => setTab("projects")}><FolderKanban size={14} style={{ verticalAlign: -2 }} /> Projects</button>
        </div>
      )}
      {tab === "team" && canTeam ? <TeamTab /> : <ProjectsTab />}
    </>
  );
}

function TeamTab() {
  const router = useRouter();
  const [t, setT] = useState<any>(null);
  const [f, setF] = useState({ q: "", role: "", status: "", flag: "", sort: "status" });
  useEffect(() => { api("/api/analytics/team").then(setT); }, []);

  const rows = useMemo(() => {
    if (!t) return [];
    const order = ["WORKING", "PAUSED", "STOPPED", "ON_LEAVE", "NOT_STARTED"];
    return t.members
      .filter((m: any) => (!f.q || `${m.name} ${m.email} ${m.designation ?? ""}`.toLowerCase().includes(f.q.toLowerCase()))
        && (!f.role || m.role === f.role) && (!f.status || m.today.status === f.status)
        && (f.flag !== "late" || m.today.isLate) && (f.flag !== "overdue" || m.overdueTasks > 0))
      .sort((a: any, b: any) => {
        if (f.sort === "hours") return b.today.workedMinutes - a.today.workedMinutes;
        if (f.sort === "overdue") return b.overdueTasks - a.overdueTasks;
        if (f.sort === "completed") return b.completed7d - a.completed7d;
        if (f.sort === "name") return a.name.localeCompare(b.name);
        return order.indexOf(a.today.status) - order.indexOf(b.today.status);
      });
  }, [t, f]);

  if (!t) return <Loading />;
  const s = t.summary;
  const presence = [
    { key: "WORKING", value: s.working }, { key: "PAUSED", value: s.onBreak }, { key: "STOPPED", value: s.checkedOut },
    { key: "ON_LEAVE", value: s.onLeave }, { key: "NOT_STARTED", value: s.notCheckedIn },
  ].map((x) => ({ ...x, color: PRESENCE_COLORS[x.key], label: PRESENCE_LABELS[x.key] }));
  const tasks = taskBuckets(t.tasksByStatus).map((b) => ({ ...b, color: TASK_COLORS[b.key], label: TASK_LABELS[b.key] }));
  const totalOverdue = t.members.reduce((n: number, m: any) => n + m.overdueTasks, 0);
  const totalHours = t.members.reduce((n: number, m: any) => n + m.today.workedMinutes, 0);
  const dayLabels = t.days.map((d: string) => DAY_NAMES[new Date(d + "T00:00:00Z").getUTCDay()]);
  const roles = [...new Set(t.members.map((m: any) => m.role))] as string[];
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span className="icon ic-primary"><Users size={18} /></span><span><span className="kpi-num">{s.total}</span><span className="kpi-cap">PALs in your team</span></span></div>
        <div className="card kpi"><span className="icon ic-success"><Clock size={18} /></span><span><span className="kpi-num">{s.working + s.onBreak + s.checkedOut}</span><span className="kpi-cap">Checked in today</span></span></div>
        <div className="card kpi"><span className="icon ic-warning"><AlertTriangle size={18} /></span><span><span className="kpi-num">{s.late}</span><span className="kpi-cap">Late today</span></span></div>
        <div className="card kpi"><span className="icon ic-purple"><Users size={18} /></span><span><span className="kpi-num">{s.onLeave}</span><span className="kpi-cap">On leave</span></span></div>
        <div className="card kpi"><span className={`icon ${totalOverdue ? "ic-danger" : "ic-success"}`}><AlertTriangle size={18} /></span><span><span className="kpi-num">{totalOverdue}</span><span className="kpi-cap">Overdue tasks · {fmtH(totalHours)} today</span></span></div>
      </div>

      <div className="dash-row r-4-4-4" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 16 }}>
        <div className="card dash-card"><div className="dc-head"><h3>Presence right now</h3></div><StackBar segments={presence} height={14} /></div>
        <div className="card dash-card"><div className="dc-head"><h3>Team tasks by status</h3></div><StackBar segments={tasks} height={14} /></div>
      </div>

      <div className="toolbar">
        <div className="input-wrap" style={{ minWidth: 220 }}><Search size={15} style={{ top: 12 }} /><input className="input" placeholder="Search PALs…" value={f.q} onChange={set("q")} /></div>
        <select className="select" value={f.role} onChange={set("role")}><option value="">All roles</option>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
        <select className="select" value={f.status} onChange={set("status")}><option value="">Any status</option>{Object.entries(PRESENCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="select" value={f.flag} onChange={set("flag")}><option value="">No flag filter</option><option value="late">Late today</option><option value="overdue">Has overdue tasks</option></select>
        <select className="select" value={f.sort} onChange={set("sort")}><option value="status">Sort: status</option><option value="hours">Sort: hours today</option><option value="overdue">Sort: overdue</option><option value="completed">Sort: completed (7d)</option><option value="name">Sort: name</option></select>
      </div>

      <div className="card">
        {rows.length === 0 ? <Empty title="No PALs match" /> : (
          <div className="table-wrap"><table className="table compact-table">
            <thead><tr><th>PAL</th><th>Today</th><th>Hours today</th><th>Last 7 days</th><th>Present</th><th>Open</th><th>Overdue</th><th>Done 7d</th></tr></thead>
            <tbody>
              {rows.map((m: any) => {
                const pct = Math.round((m.today.workedMinutes / m.requiredMinutes) * 100);
                return (
                  <tr key={m.id} className="click" onClick={() => router.push(`/users/${m.id}?tab=analytics`)}>
                    <td><div className="user-cell"><Avatar name={m.name} small /><div><div style={{ fontWeight: 600 }}>{m.name}</div><div className="sub">{m.designation || ROLE_LABEL[m.role]}</div></div></div></td>
                    <td>
                      <span className="status-line"><span className="presence-dot" style={{ background: PRESENCE_COLORS[m.today.status] }} />{PRESENCE_LABELS[m.today.status]}</span>
                      <div className="sub">{m.today.firstStartAt ? `In ${fmtTime(m.today.firstStartAt)}` : "—"}{m.today.isLate && <span style={{ color: "var(--danger)", fontWeight: 600 }}> · late {m.today.lateMinutes}m</span>}</div>
                    </td>
                    <td style={{ minWidth: 120 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{fmtH(m.today.workedMinutes)} <span className="hint">/ {fmtH(m.requiredMinutes)}</span></div><Bar value={pct} color={pct >= 100 ? "#10b981" : undefined} /></td>
                    <td><MiniBars values={m.week} target={m.requiredMinutes} labels={dayLabels} /></td>
                    <td>{m.presentDays}/7</td>
                    <td>{m.openTasks}{m.inReview > 0 && <span className="hint"> ({m.inReview} review)</span>}</td>
                    <td style={m.overdueTasks ? { color: "var(--danger)", fontWeight: 700 } : undefined}>{m.overdueTasks}</td>
                    <td>{m.completed7d}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>Bars: green = daily target met. Click a PAL to manage their schedule, salary, leave and role.</p>
    </>
  );
}

function ProjectsTab() {
  const [p, setP] = useState<any[] | null>(null);
  const [f, setF] = useState({ q: "", health: "" });
  useEffect(() => { api("/api/analytics/projects").then((r) => setP(r.projects)); }, []);
  if (!p) return <Loading />;

  const counts: Record<string, number> = {};
  p.forEach((x) => { counts[x.health] = (counts[x.health] ?? 0) + 1; });
  const shown = p.filter((x) => (!f.q || x.name.toLowerCase().includes(f.q.toLowerCase())) && (!f.health || x.health === f.health));
  const logged = p.reduce((n, x) => n + x.loggedMinutes, 0);

  return (
    <>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span className="icon ic-primary"><FolderKanban size={18} /></span><span><span className="kpi-num">{p.length}</span><span className="kpi-cap">Active projects</span></span></div>
        <div className="card kpi"><span className="icon ic-success"><FolderKanban size={18} /></span><span><span className="kpi-num">{counts.ON_TRACK ?? 0}</span><span className="kpi-cap">On track</span></span></div>
        <div className="card kpi"><span className="icon ic-warning"><AlertTriangle size={18} /></span><span><span className="kpi-num">{counts.AT_RISK ?? 0}</span><span className="kpi-cap">At risk</span></span></div>
        <div className="card kpi"><span className="icon ic-danger"><AlertTriangle size={18} /></span><span><span className="kpi-num">{counts.OFF_TRACK ?? 0}</span><span className="kpi-cap">Off track</span></span></div>
        <div className="card kpi"><span className="icon ic-info"><Clock size={18} /></span><span><span className="kpi-num">{fmtH(logged)}</span><span className="kpi-cap">Time logged</span></span></div>
      </div>

      <div className="toolbar">
        <div className="input-wrap" style={{ minWidth: 220 }}><Search size={15} style={{ top: 12 }} /><input className="input" placeholder="Search projects…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
        <div className="seg">
          {[["", "All"], ["OFF_TRACK", "Off track"], ["AT_RISK", "At risk"], ["ON_TRACK", "On track"], ["DONE", "Done"]].map(([k, l]) => (
            <button key={k} className={f.health === k ? "on" : ""} onClick={() => setF({ ...f, health: k })}>{l}{k && counts[k] ? ` (${counts[k]})` : ""}</button>
          ))}
        </div>
        <ul className="legend inline" style={{ marginTop: 0, marginLeft: "auto" }}>
          {Object.keys(TASK_LABELS).map((k) => <li key={k}><span className="sw" style={{ background: TASK_COLORS[k] }} />{TASK_LABELS[k]}</li>)}
        </ul>
      </div>

      {shown.length === 0 ? <div className="card"><Empty title="No projects match" /></div> : (
        <div className="grid grid-3">
          {shown.map((x) => {
            const [hl, tone] = HEALTH[x.health];
            const segs = taskBuckets(x.taskCounts).map((b) => ({ ...b, color: TASK_COLORS[b.key], label: TASK_LABELS[b.key] }));
            return (
              <Link key={x.id} href={`/projects/${x.id}`} className="card dash-card proj-card">
                <div className="proj-top"><span className="t" style={{ fontSize: 15 }}>{x.name}</span><span className={`badge ${tone}`}>{hl}</span></div>
                <div className="proj-bar" style={{ margin: "10px 0 12px" }}><Bar value={x.progress} color={x.health === "OFF_TRACK" ? "#ef4444" : x.health === "AT_RISK" ? "#f59e0b" : undefined} /><span>{x.progress}%</span></div>
                <StackBar segments={segs} height={8} legend={false} />
                <dl className="proj-facts">
                  <dt>Tasks</dt><dd>{x.totalTasks}</dd>
                  <dt>Overdue</dt><dd style={x.overdueTasks ? { color: "var(--danger)" } : undefined}>{x.overdueTasks}</dd>
                  <dt>Logged</dt><dd>{fmtH(x.loggedMinutes)}{x.estimatedMinutes ? <span className="hint"> / {fmtH(x.estimatedMinutes)}</span> : null}</dd>
                  <dt>Due</dt><dd>{x.dueDate ? <>{fmtDate(x.dueDate)} <span className="hint">({x.daysLeft < 0 ? `${-x.daysLeft}d late` : `${x.daysLeft}d left`})</span></> : "—"}</dd>
                  <dt>Team</dt><dd>{x._count.members} · {x.owner.name}</dd>
                </dl>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

