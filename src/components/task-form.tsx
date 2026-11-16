"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { ROLE_RANK } from "@/lib/client/format";
import { Avatar, Field, Modal, Spinner, useToast } from "./ui";
import { RichTextEditor } from "./rich-text";

export interface Member { user: { id: number; name: string; role: string } }

/** Members the current user may assign work to (mirrors the server rule). */
export function assignableMembers(members: Member[], me: { id: number; role: string }, canManage: boolean) {
  return members.filter((m) => {
    if (m.user.id === me.id) return true;
    if (canManage) return true;
    return ROLE_RANK[me.role] >= ROLE_RANK.LEAD && ROLE_RANK[me.role] > ROLE_RANK[m.user.role];
  });
}

/** Toggle list for picking several people. */
export function PeoplePicker({ options, value, onChange, meId, locked = [] }: { options: Member[]; value: number[]; onChange: (v: number[]) => void; meId: number; locked?: number[] }) {
  if (!options.length) return <p className="hint">No one available to assign.</p>;
  return (
    <div className="people-picker">
      {options.map((m) => {
        const on = value.includes(m.user.id);
        const isLocked = locked.includes(m.user.id);
        return (
          <button type="button" key={m.user.id} className={`person${on ? " on" : ""}`} disabled={isLocked}
            title={isLocked ? "Already working on this task — cannot be removed" : undefined}
            onClick={() => onChange(on ? value.filter((x) => x !== m.user.id) : [...value, m.user.id])}>
            <Avatar name={m.user.name} small /> {m.user.name}{m.user.id === meId ? " (me)" : ""}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Create a task or sub-task. Pass `projects` to show a project drop-down (e.g. from My Tasks / the dashboard);
 * managers can also create a new project from the same dialog.
 */
export function TaskFormModal({ projectId, projects, parentId, members: m0, canManage: c0, onClose, onCreated }: {
  projectId?: number; projects?: { id: number; name: string }[]; parentId?: number; members?: Member[]; canManage?: boolean;
  onClose: () => void; onCreated: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const me = user!;
  const mayCreateProject = ROLE_RANK[me.role] >= ROLE_RANK.MANAGER;
  const [pid, setPid] = useState(projectId ? String(projectId) : projects?.length === 1 ? String(projects[0].id) : "");
  const [newProject, setNewProject] = useState("");
  const [ctx, setCtx] = useState<{ members: Member[]; canManage: boolean } | null>(m0 ? { members: m0, canManage: !!c0 } : null);
  const [f, setF] = useState({ title: "", description: "", priority: "MEDIUM", estimatedMinutes: "", dueDate: "" });
  const [assignees, setAssignees] = useState<number[]>([me.id]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    if (m0) return;
    if (pid === "__new__") { setCtx({ members: [{ user: { id: me.id, name: me.name, role: me.role } }], canManage: true }); setAssignees([me.id]); return; }
    if (!pid) { setCtx(null); return; }
    let live = true;
    setCtx(null);
    api(`/api/projects/${pid}`).then((r) => { if (live) { setCtx({ members: r.project.members, canManage: r.canManage }); setAssignees((a) => a.filter((id) => id === me.id || r.project.members.some((m: Member) => m.user.id === id))); } });
    return () => { live = false; };
  }, [pid, m0, me.id, me.name, me.role]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pid) return setErr("Choose a project");
    setBusy(true);
    setErr("");
    try {
      let target = pid;
      if (pid === "__new__") {
        if (!newProject.trim()) throw new Error("Give the new project a name");
        const { project } = await api("/api/projects", { body: { name: newProject.trim() } });
        target = String(project.id);
      }
      await api(`/api/projects/${target}/tasks`, {
        body: {
          title: f.title,
          ...(f.description && { description: f.description }),
          priority: f.priority,
          ...(f.estimatedMinutes && { estimatedMinutes: Number(f.estimatedMinutes) }),
          ...(f.dueDate && { dueDate: f.dueDate }),
          ...(parentId && { parentId }),
          assigneeIds: assignees,
        },
      });
      if (pid === "__new__") toast("Project and task created");
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  const options = ctx ? assignableMembers(ctx.members, me, ctx.canManage) : [];
  return (
    <Modal title={parentId ? "New sub-task" : "New task"} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose} type="button">Cancel</button><button className="btn btn-primary" form="task-form" disabled={busy}>{busy ? <Spinner /> : "Create task"}</button></>}>
      <form id="task-form" onSubmit={submit}>
        {err && <div className="alert alert-error">{err}</div>}
        {projects && !projectId && (
          <Field label="Project">
            <select className="select" value={pid} onChange={(e) => setPid(e.target.value)} required>
              <option value="">Select a project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              {mayCreateProject && <option value="__new__">+ Create a new project…</option>}
            </select>
          </Field>
        )}
        {pid === "__new__" && <Field label="New project name"><input className="input" value={newProject} onChange={(e) => setNewProject(e.target.value)} autoFocus required /></Field>}
        <Field label="Title"><input className="input" value={f.title} onChange={set("title")} required placeholder="What needs to be done?" /></Field>
        <Field label="Description" hint="Optional — supports formatting"><RichTextEditor value={f.description} onChange={(html) => setF((s) => ({ ...s, description: html }))} placeholder="Add details, steps or links…" /></Field>
        <Field label="Assign to" hint="Pick one or more people — each gets their own timer; the task completes when everyone finishes.">
          {!ctx ? <p className="hint">{pid ? "Loading members…" : "Choose a project first."}</p> : <PeoplePicker options={options} value={assignees} onChange={setAssignees} meId={me.id} />}
        </Field>
        <div className="row">
          <Field label="Priority">
            <select className="select" value={f.priority} onChange={set("priority")}>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>)}</select>
          </Field>
          <Field label="Estimate (minutes)" hint="Optional"><input className="input" type="number" min={1} value={f.estimatedMinutes} onChange={set("estimatedMinutes")} /></Field>
          <Field label="Due date" hint="Optional"><input className="input" type="date" value={f.dueDate} onChange={set("dueDate")} /></Field>
        </div>
      </form>
    </Modal>
  );
}
