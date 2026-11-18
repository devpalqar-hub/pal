"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Plus, UserPlus, Trash2, CalendarDays, Layers, Search } from "lucide-react";
import { PalNo } from "@/components/pal-no";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { fmtDate, fmtMinutes, fmtDuration, matchesQuery } from "@/lib/client/format";
import { RichText, RichTextEditor } from "@/components/rich-text";
import { Avatar, Empty, Field, Loading, Modal, PageHeader, PriorityBadge, RoleBadge, StatusBadge, useToast } from "@/components/ui";
import { TaskFormModal } from "@/components/task-form";
import { TaskDrawer } from "@/components/task-drawer";

const COLUMNS: { title: string; statuses: string[] }[] = [
  { title: "To do", statuses: ["TODO"] },
  { title: "In progress", statuses: ["IN_PROGRESS", "PAUSED"] },
  { title: "In review", statuses: ["IN_REVIEW"] },
  { title: "Done", statuses: ["COMPLETED", "ENDED"] },
];

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [tab, setTab] = useState<"board" | "members">("board");
  const [showSubs, setShowSubs] = useState(false);
  const [newTask, setNewTask] = useState(false);
  const [openTask, setOpenTask] = useState<number | null>(null);
  const [addMember, setAddMember] = useState(false);
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");
  const [editDesc, setEditDesc] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, t] = await Promise.all([api(`/api/projects/${id}`), api(`/api/projects/${id}/tasks${showSubs ? "" : "?parentId=none"}`)]);
    setData(p);
    setTasks(t.tasks);
  }, [id, showSubs]);
  useEffect(() => { load().catch((e) => toast(e.message, true)); }, [load, toast]);

  if (!data || !tasks) return <Loading />;
  const { project, canManage, taskCounts, progress, loggedSeconds, estimatedMinutes, timeByMember, workingNow } = data;
  const visible = (mine ? tasks.filter((t) => t.assignees.some((a: any) => a.userId === user!.id && a.status === "ASSIGNED")) : tasks).filter((t) => matchesQuery(t, q));

  async function removeMember(uid: number) {
    try { await api(`/api/projects/${id}/members/${uid}`, { method: "DELETE" }); toast("Member removed"); load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
  }
  async function setStatus(status: string) {
    await api(`/api/projects/${id}`, { method: "PATCH", body: { status } });
    toast("Project updated");
    load();
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Projects", href: "/projects" }, { label: project.name }]}
        title={project.name}
        actions={
          <>
            {canManage && (
              <select className="select" style={{ width: "auto" }} value={project.status} onChange={(e) => setStatus(e.target.value)}>
                {["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            )}
            <button className="btn btn-primary" onClick={() => setNewTask(true)}><Plus size={16} /> New task</button>
          </>
        }
      />

      {(project.description || canManage) && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h4>About this project</h4>
            {canManage && editDesc === null && <button className="btn btn-ghost btn-sm" onClick={() => setEditDesc(project.description ?? "")}>Edit</button>}
          </div>
          {editDesc !== null ? (
            <>
              <RichTextEditor value={editDesc} onChange={setEditDesc} minHeight={120} autoFocus />
              <div className="actions" style={{ marginTop: 10 }}>
                <button className="btn btn-primary btn-sm" onClick={async () => { try { await api(`/api/projects/${id}`, { method: "PATCH", body: { description: editDesc || null } }); toast("Description saved"); setEditDesc(null); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", true); } }}>Save</button>
                <button className="btn btn-sm" onClick={() => setEditDesc(null)}>Cancel</button>
              </div>
            </>
          ) : project.description ? <RichText html={project.description} /> : <p className="hint">No description yet.</p>}
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 24, display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><strong>Progress</strong><span>{progress}%</span></div>
          <div className="progress"><span style={{ width: `${progress}%` }} /></div>
        </div>
        <div className="task-meta" style={{ gap: 20, fontSize: 13 }}>
          <StatusBadge status={project.status} />
          <span><CalendarDays size={14} style={{ verticalAlign: -2 }} /> {fmtDate(project.startDate)} → {fmtDate(project.dueDate)}</span>
          <span>{Object.values(taskCounts as Record<string, number>).reduce((a, b) => a + b, 0)} tasks</span>
          <span>Owner: {project.owner.name}</span>
          <span title="Time logged by everyone on this project">⏱ {fmtDuration(loggedSeconds)} logged{estimatedMinutes ? ` of ${fmtMinutes(estimatedMinutes)} est.` : ""}</span>
          {workingNow > 0 && <span className="badge b-green"><span className="timer-dot" /> {workingNow} working now</span>}
        </div>
      </div>

      <div className="tabs">
        <button className={`tab${tab === "board" ? " active" : ""}`} onClick={() => setTab("board")}>Tasks</button>
        <button className={`tab${tab === "members" ? " active" : ""}`} onClick={() => setTab("members")}>Members ({project.members.length})</button>
      </div>

      {tab === "board" && (
        <>
          <div className="toolbar">
            <div className="input-wrap" style={{ minWidth: 240 }}><Search size={15} style={{ top: 12 }} /><input className="input" placeholder="Search title or PAL-0012…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <label className="chip" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Assigned to me</label>
            <label className="chip" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={showSubs} onChange={(e) => setShowSubs(e.target.checked)} /> Include sub-tasks</label>
          </div>
          <div className="board">
            {COLUMNS.map((col) => {
              const items = visible.filter((t) => col.statuses.includes(t.status));
              return (
                <div className="column" key={col.title}>
                  <div className="column-head"><span>{col.title}</span><span className="count">{items.length}</span></div>
                  {items.map((t) => (
                    <div key={t.id} className="task-card" onClick={() => setOpenTask(t.id)}>
                      <div className="task-title"><PalNo n={t.palNo} /> {t.title}</div>
                      <div className="task-meta">
                        <PriorityBadge priority={t.priority} />
                        {t.status !== "TODO" && t.status !== "IN_PROGRESS" && <StatusBadge status={t.status} />}
                        {t.runningCount > 0 && <span className="timer-dot" title={`${t.runningCount} working now`} />}
                        {t._count.subtasks > 0 && <span><Layers size={13} style={{ verticalAlign: -2 }} /> {t._count.subtasks}</span>}
                        {t.estimatedMinutes && <span>{fmtMinutes(t.workedMinutes)}/{fmtMinutes(t.estimatedMinutes)}</span>}
                        <span className="push">{t.assignees.filter((a: any) => a.status === "ASSIGNED").length ? <span className="avatar-stack">{t.assignees.filter((a: any) => a.status === "ASSIGNED").slice(0, 3).map((a: any) => <Avatar key={a.id} name={a.user.name} small />)}{t.assignees.filter((a: any) => a.status === "ASSIGNED").length > 3 && <span className="hint" style={{ marginLeft: 4 }}>+{t.assignees.filter((a: any) => a.status === "ASSIGNED").length - 3}</span>}</span> : <span className="hint">Unassigned</span>}</span>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <div className="hint" style={{ textAlign: "center", padding: 16 }}>No tasks</div>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "members" && (
        <div className="card">
          <div className="card-head"><h3>Team</h3>{canManage && <button className="btn btn-sm" onClick={() => setAddMember(true)}><UserPlus size={14} /> Add member</button>}</div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Member</th><th>Role</th><th>Project role</th><th>Time logged</th><th /></tr></thead>
            <tbody>
              {project.members.map((m: any) => (
                <tr key={m.id}>
                  <td><div className="user-cell"><Avatar name={m.user.name} /><div><div style={{ fontWeight: 600 }}>{m.user.name}</div><div className="sub">{m.user.email}</div></div></div></td>
                  <td><RoleBadge role={m.user.role} designation={m.user.designation} /></td>
                  <td>{m.role === "OWNER" ? <span className="badge b-purple">Owner</span> : "Member"}</td>
                  <td style={{ fontWeight: 600 }}>{fmtDuration(timeByMember[m.user.id] ?? 0)}</td>
                  <td style={{ textAlign: "right" }}>{canManage && m.role !== "OWNER" && <button className="btn btn-ghost btn-sm" onClick={() => removeMember(m.user.id)} title="Remove"><Trash2 size={16} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {newTask && <TaskFormModal projectId={project.id} members={project.members} canManage={canManage} onClose={() => setNewTask(false)} onCreated={() => { setNewTask(false); toast("Task created"); load(); }} />}
      {openTask && <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={load} />}
      {addMember && <AddMemberModal projectId={project.id} existing={project.members.map((m: any) => m.user.id)} onClose={() => setAddMember(false)} onAdded={() => { setAddMember(false); load(); }} />}
    </>
  );
}

function AddMemberModal({ projectId, existing, onClose, onAdded }: { projectId: number; existing: number[]; onClose: () => void; onAdded: () => void }) {
  const toast = useToast();
  const [users, setUsers] = useState<any[] | null>(null);
  const [sel, setSel] = useState("");
  useEffect(() => { api("/api/directory").then((r) => setUsers(r.users.filter((u: any) => !existing.includes(u.id)))); }, [existing]);
  async function add() {
    try { await api(`/api/projects/${projectId}/members`, { body: { userId: Number(sel) } }); toast("Member added"); onAdded(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
  }
  return (
    <Modal title="Add member" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!sel} onClick={add}>Add</button></>}>
      {!users ? <Loading /> : users.length === 0 ? <Empty title="Nobody left to add" /> : (
        <Field label="Team member" hint="Anyone in the company can be added — whatever their role.">
          <select className="select" value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="">Select…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.designation || u.role}</option>)}
          </select>
        </Field>
      )}
    </Modal>
  );
}
