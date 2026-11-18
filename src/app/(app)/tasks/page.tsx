"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, X, Plus } from "lucide-react";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { fmtDate, fmtMinutes, isoDate, matchesQuery } from "@/lib/client/format";
import { useNotifications } from "@/lib/client/notifications";
import { Avatar, Empty, Loading, PageHeader, PriorityBadge, StatusBadge, useToast } from "@/components/ui";
import { TaskFormModal } from "@/components/task-form";
import { TaskDrawer } from "@/components/task-drawer";
import { PalNo } from "@/components/pal-no";
import { FollowUpList } from "@/components/follow-up-list";

const STATUSES = ["TODO", "IN_PROGRESS", "PAUSED", "COMPLETED", "IN_REVIEW", "ENDED"];
const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"];
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };
type Tab = "mine" | "review" | "assigned" | "followups";

/** How one assignee is getting on with a task. */
const personState = (a: any): [string, string, string] =>
  a.status === "REJECTED" ? ["declined", "Declined", "b-red"]
    : a.doneAt ? ["done", "Finished", "b-green"]
      : a.isRunning ? ["working", "Working now", "b-blue"]
        : a.startedAt ? ["paused", "Paused", "b-amber"]
          : ["not_started", "Not started", "b-gray"];

const BLANK = { q: "", status: "", priority: "", project: "", due: "", kind: "", hideEnded: true, onlyNew: false, person: "", progress: "", sort: "due" };

export default function MyTasks() {
  const { user } = useAuth();
  const { unreadTaskIds } = useNotifications();
  const toast = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [projectList, setProjectList] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => { api("/api/projects").then((r) => setProjectList(r.projects.filter((p: any) => p.status === "ACTIVE" || p.status === "ON_HOLD"))); }, []);
  const params = useSearchParams();
  const openParam = Number(params.get("open")) || null;
  const tabParam = params.get("tab");
  const [tab, setTab] = useState<Tab>(tabParam === "assigned" || tabParam === "followups" ? tabParam : "mine");
  const [fuCount, setFuCount] = useState({ due: 0, overdue: 0 });
  const [mine, setMine] = useState<any[] | null>(null);
  const [review, setReview] = useState<any[] | null>(null);
  const [assigned, setAssigned] = useState<any[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(openParam);
  useEffect(() => { const id = openParam; if (id) setOpenId(id); }, [openParam]);
  const [f, setF] = useState(BLANK);

  /** Badge: my pending lead follow-ups due today or overdue. */
  const loadFollowUpCount = useCallback(async () => {
    const [o, t] = await Promise.all([api("/api/leads/follow-ups?when=overdue"), api("/api/leads/follow-ups?when=today")]).catch(() => [{ followUps: [] }, { followUps: [] }]);
    const overdueIds = new Set(o.followUps.map((x: any) => x.id));
    setFuCount({ overdue: overdueIds.size, due: overdueIds.size + t.followUps.filter((x: any) => !overdueIds.has(x.id)).length });
  }, []);

  const load = useCallback(async () => {
    const [m, r, a] = await Promise.all([api("/api/tasks/me"), api("/api/tasks/me?role=reviewer"), api("/api/tasks/me?role=assigner"), loadFollowUpCount()]);
    setMine(m.tasks); setReview(r.tasks); setAssigned(a.tasks);
  }, [loadFollowUpCount]);
  useEffect(() => { load(); }, [load]);

  const source = tab === "mine" ? mine : tab === "review" ? review : assigned;
  const projects = useMemo(() => {
    const m = new Map<number, string>();
    (source ?? []).forEach((t) => m.set(t.project.id, t.project.name));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [source]);
  /** People I've handed work to (for the "Assigned by me" filter). */
  const people = useMemo(() => {
    const m = new Map<number, string>();
    (assigned ?? []).forEach((t) => t.assignees.forEach((a: any) => a.userId !== user!.id && m.set(a.userId, a.user.name)));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [assigned, user]);
  const others = (t: any) => t.assignees.filter((a: any) => a.userId !== user!.id && (!f.person || String(a.userId) === f.person));

  const shown = useMemo(() => {
    if (!source) return null;
    const today = isoDate(), week = addDays(7);
    const rank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const list = source.filter((t) => {
      if (tab !== "review") {
        if (f.hideEnded && !f.status && t.status === "ENDED") return false;
        if (f.status && t.status !== f.status) return false;
      }
      if (f.priority && t.priority !== f.priority) return false;
      if (f.project && String(t.project.id) !== f.project) return false;
      if (f.onlyNew && !unreadTaskIds.has(t.id)) return false;
      if (f.kind === "top" && t.parent) return false;
      if (f.kind === "sub" && !t.parent) return false;
      if (!matchesQuery(t, f.q)) return false;
      const due = t.dueDate?.slice(0, 10);
      if (f.due === "overdue" && !(due && due < today && t.status !== "ENDED" && t.status !== "COMPLETED")) return false;
      if (f.due === "today" && due !== today) return false;
      if (f.due === "week" && !(due && due >= today && due <= week)) return false;
      if (f.due === "none" && due) return false;
      if (tab === "assigned") {
        const ppl = others(t);
        if (f.person && !ppl.length) return false;
        if (f.progress && !ppl.some((a: any) => personState(a)[0] === f.progress)) return false;
      }
      return true;
    });
    if (f.sort === "priority") list.sort((a, b) => rank[a.priority] - rank[b.priority]);
    else if (f.sort === "newest") list.sort((a, b) => b.palNo - a.palNo);
    else if (f.sort === "updated") list.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, f, tab, unreadTaskIds]);

  /** Parents first, with their sub-tasks listed directly beneath them (when both are in the list). */
  const ordered = useMemo(() => {
    if (!shown) return null;
    const ids = new Set(shown.map((t) => t.id));
    const childrenOf = new Map<number, any[]>();
    shown.forEach((t) => { if (t.parent && ids.has(t.parent.id)) childrenOf.set(t.parent.id, [...(childrenOf.get(t.parent.id) ?? []), t]); });
    const out: { task: any; nested: boolean }[] = [];
    shown.forEach((t) => {
      if (t.parent && ids.has(t.parent.id)) return;
      out.push({ task: t, nested: false });
      (childrenOf.get(t.id) ?? []).forEach((c) => out.push({ task: c, nested: true }));
    });
    return out;
  }, [shown]);

  const newCount = (mine ?? []).filter((t) => unreadTaskIds.has(t.id)).length;
  const assignedOpen = (assigned ?? []).filter((t) => !["ENDED", "COMPLETED"].includes(t.status)).length;
  const dirty = Object.entries(f).some(([k, v]) => k !== "hideEnded" && k !== "sort" && v);
  const set = (k: keyof typeof BLANK) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const switchTab = (t: Tab) => { setTab(t); setF((s) => ({ ...s, person: "", progress: "", project: "" })); };

  return (
    <>
      <PageHeader title="My tasks" subtitle="Work assigned to you, work you’ve handed to others, reviews waiting on you and your lead follow-ups." actions={<button className="btn btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New task</button>} />
      <div className="tabs">
        <button className={`tab${tab === "mine" ? " active" : ""}`} onClick={() => switchTab("mine")}>
          Assigned to me {newCount > 0 && <span className="badge b-purple">{newCount} new</span>}
        </button>
        <button className={`tab${tab === "assigned" ? " active" : ""}`} onClick={() => switchTab("assigned")}>
          Assigned by me {assignedOpen > 0 && <span className="badge b-gray">{assignedOpen} open</span>}
        </button>
        <button className={`tab${tab === "review" ? " active" : ""}`} onClick={() => switchTab("review")}>
          Waiting for my review {review && review.length > 0 && <span className="badge b-red">{review.length}</span>}
        </button>
        <button className={`tab${tab === "followups" ? " active" : ""}`} onClick={() => switchTab("followups")}>
          Lead follow-ups {fuCount.due > 0 && <span className={`badge ${fuCount.overdue ? "b-red" : "b-amber"}`}>{fuCount.overdue ? `${fuCount.overdue} overdue` : `${fuCount.due} today`}</span>}
        </button>
      </div>

      {tab === "followups" ? <FollowUpList onChanged={loadFollowUpCount} /> : <>

      <div className="toolbar">
        <div className="input-wrap" style={{ minWidth: 240 }}><Search size={15} style={{ top: 12 }} /><input className="input" placeholder="Search title or PAL-0012…" value={f.q} onChange={set("q")} /></div>
        {tab !== "review" && (
          <select className="select" value={f.status} onChange={set("status")}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        )}
        {tab === "assigned" && (
          <>
            <select className="select" value={f.person} onChange={set("person")}>
              <option value="">Anyone I assigned</option>
              {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select className="select" value={f.progress} onChange={set("progress")}>
              <option value="">Any progress</option>
              <option value="not_started">Not started</option>
              <option value="working">Working now</option>
              <option value="paused">Paused</option>
              <option value="done">Finished their part</option>
              <option value="declined">Declined</option>
            </select>
          </>
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
          <option value="today">Due today</option>
          <option value="week">Due in 7 days</option>
          <option value="none">No due date</option>
        </select>
        <select className="select" value={f.kind} onChange={set("kind")}>
          <option value="">Tasks & sub-tasks</option>
          <option value="top">Tasks only</option>
          <option value="sub">Sub-tasks only</option>
        </select>
        <select className="select" value={f.sort} onChange={set("sort")}>
          <option value="due">Sort: due date</option>
          <option value="priority">Sort: priority</option>
          <option value="newest">Sort: newest (PAL-NO)</option>
          <option value="updated">Sort: recently updated</option>
        </select>
        {tab === "mine" && <label className="chip" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={f.onlyNew} onChange={(e) => setF({ ...f, onlyNew: e.target.checked })} /> New only</label>}
        {tab !== "review" && !f.status && <label className="chip" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={f.hideEnded} onChange={(e) => setF({ ...f, hideEnded: e.target.checked })} /> Hide ended</label>}
        {dirty && <button className="btn btn-ghost btn-sm" onClick={() => setF({ ...BLANK, sort: f.sort, hideEnded: f.hideEnded })}><X size={14} /> Clear</button>}
        {shown && <span className="hint" style={{ marginLeft: "auto" }}>{shown.length} task{shown.length === 1 ? "" : "s"}</span>}
      </div>

      <div className="card">
        {!ordered ? <Loading /> : ordered.length === 0 ? <Empty title={dirty ? "No tasks match these filters" : tab === "assigned" ? "You haven’t assigned any tasks to others yet" : "Nothing here"} /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>No.</th><th>Task</th><th>Project</th>{tab === "assigned" && <th>Assigned to</th>}<th>Priority</th><th>Status</th><th>Time</th><th>Due</th></tr></thead>
            <tbody>
              {ordered.map(({ task: t, nested }) => {
                const isNew = unreadTaskIds.has(t.id);
                const overdue = t.dueDate && t.dueDate.slice(0, 10) < isoDate() && !["ENDED", "COMPLETED"].includes(t.status);
                return (
                  <tr key={t.id} className={`click${nested ? " nested-row" : ""}`} onClick={() => setOpenId(t.id)}>
                    <td><PalNo n={t.palNo} /></td>
                    <td style={{ fontWeight: isNew ? 700 : 600 }}>
                      {isNew && <span className="dot-new" style={{ marginRight: 8 }} title="New" />}{nested && <span className="hint">↳ </span>}{t.title}
                      {t._count?.subtasks > 0 && <span className="badge b-gray" style={{ marginLeft: 8 }}>{t._count.subtasks} sub-task{t._count.subtasks > 1 ? "s" : ""}</span>}
                      {t.mine?.isRunning && <span className="timer-dot" style={{ display: "inline-block", marginLeft: 8 }} />}
                      {tab !== "assigned" && t.assignees?.filter((a: any) => a.status === "ASSIGNED").length > 1 && <span className="badge b-gray" style={{ marginLeft: 8 }}>Shared</span>}
                      {t.mine?.doneAt && t.status !== "COMPLETED" && t.status !== "ENDED" && <span className="badge b-green" style={{ marginLeft: 8 }}>My part done</span>}
                      {t.parent && (
                        <div className="sub-of">Sub-task of <a className="parent-link" onClick={(e) => { e.stopPropagation(); setOpenId(t.parent.id); }} title="Open the parent task">{t.parent.title}</a></div>
                      )}
                    </td>
                    <td>{t.project.name}</td>
                    {tab === "assigned" && (
                      <td style={{ minWidth: 190 }}>
                        {others(t).map((a: any) => {
                          const [, label, tone] = personState(a);
                          return <div key={a.id} className="user-cell" style={{ marginBottom: 4 }}><Avatar name={a.user.name} small /><span style={{ fontSize: 13 }}>{a.user.name}</span><span className={`badge ${tone}`}>{a.isRunning && <span className="timer-dot" />}{label}</span></div>;
                        })}
                      </td>
                    )}
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
      </>}
      {newOpen && <TaskFormModal projects={projectList} onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); toast("Task created"); load(); }} />}
      {openId && <TaskDrawer taskId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}
