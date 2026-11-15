"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { fmtDate, fmtMinutes, isoDate } from "@/lib/client/format";
import { useNotifications } from "@/lib/client/notifications";
import { Empty, Loading, PageHeader, PriorityBadge, StatusBadge } from "@/components/ui";
import { TaskDrawer } from "@/components/task-drawer";

const STATUSES = ["TODO", "IN_PROGRESS", "PAUSED", "COMPLETED", "IN_REVIEW", "ENDED"];
const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"];
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };

export default function MyTasks() {
  const { unreadTaskIds } = useNotifications();
  const openParam = Number(useSearchParams().get("open")) || null;
  const [tab, setTab] = useState<"mine" | "review">("mine");
  const [mine, setMine] = useState<any[] | null>(null);
  const [review, setReview] = useState<any[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(openParam);
  const [f, setF] = useState({ q: "", status: "", priority: "", project: "", due: "", hideEnded: true, onlyNew: false });

  const load = useCallback(async () => {
    const [m, r] = await Promise.all([api("/api/tasks/me"), api("/api/tasks/me?role=reviewer")]);
    setMine(m.tasks); setReview(r.tasks);
  }, []);
  useEffect(() => { load(); }, [load]);

  const source = tab === "mine" ? mine : review;
  const projects = useMemo(() => {
    const m = new Map<number, string>();
    (mine ?? []).forEach((t) => m.set(t.project.id, t.project.name));
    return [...m.entries()];
  }, [mine]);

  const shown = useMemo(() => {
    if (!source) return null;
    const today = isoDate(), week = addDays(7);
    return source.filter((t) => {
      if (tab === "mine") {
        if (f.hideEnded && !f.status && t.status === "ENDED") return false;
        if (f.status && t.status !== f.status) return false;
      }
      if (f.priority && t.priority !== f.priority) return false;
      if (f.project && String(t.project.id) !== f.project) return false;
      if (f.onlyNew && !unreadTaskIds.has(t.id)) return false;
      if (f.q && !t.title.toLowerCase().includes(f.q.toLowerCase())) return false;
      const due = t.dueDate?.slice(0, 10);
      if (f.due === "overdue" && !(due && due < today && t.status !== "ENDED" && t.status !== "COMPLETED")) return false;
      if (f.due === "week" && !(due && due >= today && due <= week)) return false;
      if (f.due === "none" && due) return false;
      return true;
    });
  }, [source, f, tab, unreadTaskIds]);

  const newCount = (mine ?? []).filter((t) => unreadTaskIds.has(t.id)).length;
  const dirty = f.q || f.status || f.priority || f.project || f.due || f.onlyNew;
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <PageHeader title="My tasks" subtitle="Everything assigned to you across projects." />
      <div className="tabs">
        <button className={`tab${tab === "mine" ? " active" : ""}`} onClick={() => setTab("mine")}>
          Assigned to me {newCount > 0 && <span className="badge b-purple">{newCount} new</span>}
        </button>
        <button className={`tab${tab === "review" ? " active" : ""}`} onClick={() => setTab("review")}>
          Waiting for my review {review && review.length > 0 && <span className="badge b-red">{review.length}</span>}
        </button>
      </div>

      <div className="toolbar">
        <div className="input-wrap" style={{ minWidth: 220 }}><Search size={15} style={{ top: 12 }} /><input className="input" placeholder="Search tasks…" value={f.q} onChange={set("q")} /></div>
        {tab === "mine" && (
          <select className="select" value={f.status} onChange={set("status")}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        )}
        <select className="select" value={f.priority} onChange={set("priority")}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>)}
        </select>
        <select className="select" value={f.project} onChange={set("project")}>
          <option value="">All projects</option>
          {projects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select className="select" value={f.due} onChange={set("due")}>
          <option value="">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="week">Due in 7 days</option>
          <option value="none">No due date</option>
        </select>
        <label className="chip" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={f.onlyNew} onChange={(e) => setF({ ...f, onlyNew: e.target.checked })} /> New only</label>
        {tab === "mine" && !f.status && <label className="chip" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={f.hideEnded} onChange={(e) => setF({ ...f, hideEnded: e.target.checked })} /> Hide ended</label>}
        {dirty && <button className="btn btn-ghost btn-sm" onClick={() => setF({ ...f, q: "", status: "", priority: "", project: "", due: "", onlyNew: false })}><X size={14} /> Clear</button>}
      </div>

      <div className="card">
        {!shown ? <Loading /> : shown.length === 0 ? <Empty title={dirty ? "No tasks match these filters" : "Nothing here"} /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Task</th><th>Project</th><th>Priority</th><th>Status</th><th>Time</th><th>Due</th></tr></thead>
            <tbody>
              {shown.map((t) => {
                const isNew = unreadTaskIds.has(t.id);
                const overdue = t.dueDate && t.dueDate.slice(0, 10) < isoDate() && !["ENDED", "COMPLETED"].includes(t.status);
                return (
                  <tr key={t.id} className="click" onClick={() => setOpenId(t.id)}>
                    <td style={{ fontWeight: isNew ? 700 : 600 }}>
                      {isNew && <span className="dot-new" style={{ marginRight: 8 }} title="New" />}{t.title}
                      {t.isTimerRunning && <span className="timer-dot" style={{ display: "inline-block", marginLeft: 8 }} />}
                    </td>
                    <td>{t.project.name}</td>
                    <td><PriorityBadge priority={t.priority} /></td>
                    <td><StatusBadge status={t.status} /></td>
                    <td>{fmtMinutes(t.workedMinutes)}{t.estimatedMinutes ? ` / ${fmtMinutes(t.estimatedMinutes)}` : ""}</td>
                    <td style={overdue ? { color: "var(--danger)", fontWeight: 600 } : undefined}>{fmtDate(t.dueDate)}{overdue && " · overdue"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>
      {openId && <TaskDrawer taskId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}
