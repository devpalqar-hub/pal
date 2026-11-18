"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Users, Activity, AlertTriangle, Gauge } from "lucide-react";
import { api } from "@/lib/client/api";
import { fmtTime } from "@/lib/client/format";
import { Avatar, Empty, Loading, PageHeader, RoleBadge } from "@/components/ui";
import { Bar, PRESENCE_COLORS, PRESENCE_LABELS, fmtH } from "@/components/charts";

export const CULTURE_TONE = (s: number) => (s >= 85 ? "var(--success)" : s >= 70 ? "#3b82f6" : s >= 50 ? "var(--warning)" : "var(--danger)");

export default function TeamView() {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [t, setT] = useState<any>(null);
  const [f, setF] = useState({ q: "", role: "", state: "", sort: "state" });
  useEffect(() => { setT(null); api(`/api/team?days=${days}`).then(setT); }, [days]);

  const rows = useMemo(() => {
    if (!t) return [];
    const order = ["WORKING", "PAUSED", "STOPPED", "NOT_STARTED"];
    return t.members
      .filter((m: any) => (!f.q || `${m.name} ${m.email} ${m.designation ?? ""}`.toLowerCase().includes(f.q.toLowerCase())) && (!f.role || m.role === f.role) && (!f.state || m.today.state === f.state))
      .sort((a: any, b: any) => {
        if (f.sort === "score") return b.culture.score - a.culture.score;
        if (f.sort === "low") return a.culture.score - b.culture.score;
        if (f.sort === "overdue") return b.tasks.overdue - a.tasks.overdue;
        if (f.sort === "name") return a.name.localeCompare(b.name);
        return order.indexOf(a.today.state) - order.indexOf(b.today.state);
      });
  }, [t, f]);

  if (!t) return <><PageHeader title="Team" subtitle="Tasks, status and work culture of everyone under you." /><Loading /></>;
  const s = t.summary;
  const roles = [...new Set<string>(t.members.map((m: any) => m.role))];
  const kpis = [
    { icon: Users, label: "People", value: s.total, tone: "b-purple" },
    { icon: Activity, label: "Working now", value: s.working, tone: "b-green" },
    { icon: Activity, label: "On break / paused", value: s.paused, tone: "b-amber" },
    { icon: AlertTriangle, label: "Overdue tasks", value: s.overdue, tone: "b-red" },
    { icon: Gauge, label: `Avg culture score (${t.days}d)`, value: s.avgScore, tone: "b-blue" },
  ];

  return (
    <>
      <PageHeader title="Team" subtitle="Tasks, status and work culture of everyone under you — live, in IST." />
      <div className="kpis" style={{ marginBottom: 16 }}>
        {kpis.map((k) => (
          <div className="card kpi" key={k.label}>
            <span className={`icon ${k.tone}`}><k.icon size={18} /></span>
            <div><span className="kpi-num">{k.value}</span><span className="kpi-cap">{k.label}</span></div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: 11, color: "var(--muted)" }} />
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Search by name, email or title…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        </div>
        <select className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="">All roles</option>{roles.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}</select>
        <select className="select" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}><option value="">Any status</option>{Object.entries(PRESENCE_LABELS).filter(([k]) => k !== "ON_LEAVE").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="select" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}>
          <option value="state">Sort: live status</option><option value="score">Sort: best culture</option><option value="low">Sort: needs attention</option><option value="overdue">Sort: most overdue</option><option value="name">Sort: name</option>
        </select>
        <select className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>
      </div>

      <div className="card">
        {rows.length === 0 ? <Empty title={t.members.length ? "No one matches these filters" : "Nobody reports to you yet"} /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Person</th><th>Today</th><th>Working on</th><th>Tasks</th><th>Work culture ({t.days}d)</th></tr></thead>
            <tbody>
              {rows.map((m: any) => (
                <tr key={m.id} className="click" onClick={() => router.push(`/team/${m.id}`)}>
                  <td><div className="user-cell"><Avatar name={m.name} /><div><div style={{ fontWeight: 600 }}>{m.name}</div><div className="sub"><RoleBadge role={m.role} designation={m.designation} /></div></div></div></td>
                  <td>
                    <span className="badge" style={{ background: PRESENCE_COLORS[m.today.state] + "26" }}>{m.today.state === "WORKING" && <span className="timer-dot" />}{PRESENCE_LABELS[m.today.state]}</span>
                    <div className="sub">{m.today.firstStartAt ? `In ${fmtTime(m.today.firstStartAt)} · ${fmtH(m.today.workedMinutes)}` : "—"}{m.today.isLate && <span className="badge b-red" style={{ marginLeft: 6 }}>Late</span>}</div>
                    {m.today.autoPaused && m.today.state === "PAUSED" && <div className="sub">Auto-paused at shift end</div>}
                  </td>
                  <td style={{ maxWidth: 220 }}>{m.tasks.working ? <span style={{ fontWeight: 500 }}><span className="timer-dot" /> {m.tasks.working.title}</span> : <span className="hint">—</span>}</td>
                  <td>
                    <div>{m.tasks.open} open{m.tasks.byStatus.IN_REVIEW ? ` · ${m.tasks.byStatus.IN_REVIEW} in review` : ""}</div>
                    {m.tasks.overdue > 0 ? <div className="sub" style={{ color: "var(--danger)" }}>{m.tasks.overdue} overdue</div> : <div className="sub">{m.projects} project{m.projects === 1 ? "" : "s"}</div>}
                  </td>
                  <td style={{ minWidth: 190 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><strong style={{ color: CULTURE_TONE(m.culture.score) }}>{m.culture.score}</strong><span className="hint">{m.culture.label}</span></div>
                    <Bar value={m.culture.score} color={CULTURE_TONE(m.culture.score)} />
                    <div className="sub">{m.culture.attendanceRate}% attendance · {m.culture.punctuality}% on time</div>
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
