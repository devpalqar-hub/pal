"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { ROLE_RANK } from "@/lib/client/format";
import { Field, Modal, Spinner } from "./ui";

export interface Member { user: { id: number; name: string; role: string } }

/** Members the current user may assign work to (mirrors the server rule). */
export function assignableMembers(members: Member[], me: { id: number; role: string }, canManage: boolean) {
  return members.filter((m) => {
    if (m.user.id === me.id) return true;
    if (canManage) return true;
    return ROLE_RANK[me.role] >= ROLE_RANK.LEAD && ROLE_RANK[me.role] > ROLE_RANK[m.user.role];
  });
}

export function TaskFormModal({ projectId, parentId, members, canManage, onClose, onCreated }: {
  projectId: number; parentId?: number; members: Member[]; canManage: boolean; onClose: () => void; onCreated: () => void;
}) {
  const { user } = useAuth();
  const [f, setF] = useState({ title: "", description: "", priority: "MEDIUM", estimatedMinutes: "", dueDate: "", assigneeId: String(user!.id) });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api(`/api/projects/${projectId}/tasks`, {
        body: {
          title: f.title,
          ...(f.description && { description: f.description }),
          priority: f.priority,
          ...(f.estimatedMinutes && { estimatedMinutes: Number(f.estimatedMinutes) }),
          ...(f.dueDate && { dueDate: f.dueDate }),
          ...(parentId && { parentId }),
          assigneeId: f.assigneeId === "" ? null : Number(f.assigneeId),
        },
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  const options = assignableMembers(members, user!, canManage);
  return (
    <Modal
      title={parentId ? "New sub-task" : "New task"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-primary" form="task-form" disabled={busy}>{busy ? <Spinner /> : "Create task"}</button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit}>
        {err && <div className="alert alert-error">{err}</div>}
        <Field label="Title"><input className="input" value={f.title} onChange={set("title")} required autoFocus placeholder="What needs to be done?" /></Field>
        <Field label="Description" hint="Optional"><textarea className="textarea" value={f.description} onChange={set("description")} /></Field>
        <div className="row">
          <Field label="Assign to">
            <select className="select" value={f.assigneeId} onChange={set("assigneeId")}>
              <option value="">Unassigned (backlog)</option>
              {options.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}{m.user.id === user!.id ? " (me)" : ""}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className="select" value={f.priority} onChange={set("priority")}>
              {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>)}
            </select>
          </Field>
        </div>
        <div className="row">
          <Field label="Estimate (minutes)" hint="Optional"><input className="input" type="number" min={1} value={f.estimatedMinutes} onChange={set("estimatedMinutes")} /></Field>
          <Field label="Due date" hint="Optional"><input className="input" type="date" value={f.dueDate} onChange={set("dueDate")} /></Field>
        </div>
      </form>
    </Modal>
  );
}
