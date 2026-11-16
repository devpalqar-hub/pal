"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { fmtDate, fmtMinutes, isoDate } from "@/lib/client/format";
import { useNotifications } from "@/lib/client/notifications";
import { Plus } from "lucide-react";
import { Empty, Loading, PageHeader, PriorityBadge, StatusBadge, useToast } from "@/components/ui";
import { TaskFormModal } from "@/components/task-form";
import { TaskDrawer } from "@/components/task-drawer";

const STATUSES = ["TODO", "IN_PROGRESS", "PAUSED", "COMPLETED", "IN_REVIEW", "ENDED"];
const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"];
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };

export default function MyTasks() {
  const { unreadTaskIds } = useNotifications();
  const toast = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [projectList, setProjectList] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => { api("/api/projects").then((r) => setProjectList(r.projects.filter((p: any) => p.status === "ACTIVE" || p.status === "ON_HOLD"))); }, []);
  const openParam = Number(useSearchParams().get("open")) || null;
  const [tab, setTab] = useState<"mine" | "review">("mine");
  const [mine, setMine] = useState<any[] | null>(null);
  const [review, setReview] = useState<any[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(openParam);
  const [f, setF] = useState({ q: "", status: "", priority: "", project: "", due: "", kind: "", hideEnded: true, onlyNew: false });

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
      if (f.kind === "top" && t.parent) return false;
      if (f.kind === "sub" && !t.parent) return false;
      if (f.q && !t.title.toLowerCase().includes(f.q.toLowerCase())) return false;
      const due = t.dueDate?.slice(0, 10);
      if (f.due === "overdue" && !(due && due < today && t.status !== "ENDED" && t.status !== "COMPLETED")) return false;
      if (f.due === "week" && !(due && due >= today && due <= week)) return false;
      if (f.due === "none" && due) return false;
      return true;
    });
  }, [source, f, tab, unreadTaskIds]);

  /** Parents first, with their sub-tasks listed directly beneath them (when both are in the list). */
  const ordered = useMemo(() => {
    if (!shown) return null;
    const ids = new Set(shown.map((t) => t.id));
    const childrenOf = new Map<number, any[]>();
    shown.forEach((t) => { if (t.parent && ids.has(t.parent.id)) childrenOf.set(t.parent.id, [...(childrenOf.get(t.parent.id) ?? []), t]); });
    const out: { task: any; nested: boolean }[] = [];
    shown.forEach((t) => {
      if (t.parent && ids.has(t.parent.id)) return; // emitted under its parent
      out.push({ task: t, nested: false });
      (childrenOf.get(t.id) ?? []).forEach((c) => out.push({ task: c, nested: true }));
    });
    return out;
  }, [shown]);

  const newCount = (mine ?? []).filter((t) => unreadTaskIds.has(t.id)).length;
  const dirty = f.q || f.status || f.priority || f.project || f.due || f.kind || f.onlyNew;
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <PageHeader title="My tasks" subtitle="Everything assigned to you across projects." actions={<button className="btn btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New task</button>} />
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
        <select className="select" value={f.kind} onChange={set("kind")}>
          <option value="">Tasks & sub-tasks</option>
          <option value="top">Tasks only</option>
          <option value="sub">Sub-tasks only</option>
        </select>
        <label className="chip" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={f.onlyNew} onChange={(e) => setF({ ...f, onlyNew: e.target.checked })} /> New only</label>
        {tab === "mine" && !f.status && <label className="chip" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={f.hideEnded} onChange={(e) => setF({ ...f, hideEnded: e.target.checked })} /> Hide ended</label>}
        {dirty && <button className="btn btn-ghost btn-sm" onClick={() => setF({ ...f, q: "", status: "", priority: "", project: "", due: "", kind: "", onlyNew: false })}><X size={14} /> Clear</button>}
      </div>

      <div className="card">
        {!ordered ? <Loading /> : ordered.length === 0 ? <Empty title={dirty ? "No tasks match these filters" : "Nothing here"} /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Task</th><th>Project</th><th>Priority</th><th>Status</th><th>Time</th><th>Due</th></tr></thead>
            <tbody>
              {ordered.map(({ task: t, nested }) => {
                const isNew = unreadTaskIds.has(t.id);
                const overdue = t.dueDate && t.dueDate.slice(0, 10) < isoDate() && !["ENDED", "COMPLETED"].includes(t.status);
                return (
                  <tr key={t.id} className={`click${nested ? " nested-row" : ""}`} onClick={() => setOpenId(t.id)}>
                    <td style={{ fontWeight: isNew ? 700 : 600 }}>
                      {isNew && <span className="dot-new" style={{ marginRight: 8 }} title="New" />}{nested && <span className="hint">↳ </span>}{t.title}
                      {t._count?.subtasks > 0 && <span className="badge b-gray" style={{ marginLeft: 8 }}>{t._count.subtasks} sub-task{t._count.subtasks > 1 ? "s" : ""}</span>}
                      {t.mine?.isRunning && <span className="timer-dot" style={{ display: "inline-block", marginLeft: 8 }} />}
                      {t.assignees?.filter((a: any) => a.status === "ASSIGNED").length > 1 && <span className="badge b-gray" style={{ marginLeft: 8 }}>Shared</span>}
                      {t.mine?.doneAt && t.status !== "COMPLETED" && t.status !== "ENDED" && <span className="badge b-green" style={{ marginLeft: 8 }}>My part done</span>}
                      {t.parent && (
                        <div className="sub-of">Sub-task of <a className="parent-link" onClick={(e) => { e.stopPropagation(); setOpenId(t.parent.id); }} title="Open the parent task">{t.parent.title}</a></div>
                      )}
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
      {newOpen && <TaskFormModal projects={projectList} onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); toast("Task created"); load(); }} />}
      {openId && <TaskDrawer taskId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}
