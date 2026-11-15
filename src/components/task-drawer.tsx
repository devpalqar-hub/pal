"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Play, Pause, CheckCircle2, Send, Flag, ThumbsUp, ThumbsDown, Plus, UserRound, CalendarDays, Timer } from "lucide-react";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { fmtDateTime, fmtDate, fmtDuration, fmtMinutes } from "@/lib/client/format";
import { useNotifications } from "@/lib/client/notifications";
import { Avatar, Loading, Modal, PriorityBadge, StatusBadge, useToast, Field } from "./ui";
import { TaskFormModal, type Member } from "./task-form";

const EVENT_LABEL: Record<string, string> = {
  CREATED: "Task created", ASSIGNED: "Assignment changed", STARTED: "Started", PAUSED: "Paused", RESUMED: "Resumed",
  COMPLETED: "Marked complete", REVIEW_REQUESTED: "Sent for review", APPROVED: "Review approved", REJECTED: "Changes requested", ENDED: "Task ended",
};

/** Live ticking time for a task. */
function Elapsed({ task, fetchedAt }: { task: any; fetchedAt: number }) {
  const [now, setNow] = useState(fetchedAt);
  useEffect(() => {
    if (!task.isTimerRunning) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [task.isTimerRunning]);
  const extra = task.isTimerRunning ? Math.max(0, now - fetchedAt) / 1000 : 0;
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtDuration(task.workedSeconds + extra, true)}</span>;
}

export function TaskDrawer({ taskId, onClose, onChanged }: { taskId: number; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const { unreadTaskIds, markRead } = useNotifications();
  const [task, setTask] = useState<any>(null);
  const [project, setProject] = useState<{ members: Member[]; canManage: boolean } | null>(null);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | "complete" | "review" | "reject">(null);
  const [reviewerId, setReviewerId] = useState("");
  const [note, setNote] = useState("");
  const [subOpen, setSubOpen] = useState(false);
  const [openId, setOpenId] = useState(taskId);

  const load = useCallback(async () => {
    const { task } = await api(`/api/tasks/${openId}`);
    const p = await api(`/api/projects/${task.projectId}`);
    setTask(task);
    setProject({ members: p.project.members, canManage: p.canManage });
    setFetchedAt(Date.now());
  }, [openId]);

  useEffect(() => {
    setTask(null);
    load().catch((e) => toast(e.message, true));
  }, [load, toast]);

  // Opening a task clears its unread notifications.
  useEffect(() => {
    if (unreadTaskIds.has(openId)) markRead({ taskId: openId }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  async function act(path: string, body?: unknown, ok?: string) {
    setBusy(true);
    try {
      await api(`/api/tasks/${task.id}/${path}`, { method: "POST", body: body ?? undefined });
      toast(ok ?? "Updated");
      setDialog(null);
      setNote("");
      await load();
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", true);
    } finally {
      setBusy(false);
    }
  }

  if (!task || !project || !user) {
    return (
      <div className="drawer-overlay"><div className="drawer"><Loading /></div></div>
    );
  }

  const isAssignee = task.assigneeId === user.id;
  const isOwner = (task.assigneeId ?? task.createdById) === user.id;
  const isCreator = task.createdById === user.id;
  const { canManage } = project;
  const reviewers = project.members.filter((m) => m.user.id !== task.assigneeId);

  const status = task.status as string;
  const openSubs = task.subtasks.filter((s: any) => !["COMPLETED", "ENDED"].includes(s.status)).length;

  return (
    <div className="drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="drawer-head">
          <div>
            <div className="crumbs">
              {task.parentId ? <a style={{ cursor: "pointer" }} onClick={() => setOpenId(task.parentId)}>← Parent task</a> : task.project.name}
            </div>
            <h2 style={{ fontSize: 20 }}>{task.title}</h2>
            <div className="actions" style={{ marginTop: 8 }}>
              <StatusBadge status={status} /> <PriorityBadge priority={task.priority} />
              {task.isTimerRunning && <span className="badge b-green"><span className="timer-dot" /> Timer running</span>}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div className="drawer-body">
          {/* ── Workflow actions ── */}
          <div className="card card-pad" style={{ marginBottom: 24, background: "#fafbff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <Timer size={18} color="var(--primary)" />
              <span style={{ fontSize: 26, fontWeight: 700 }}><Elapsed task={task} fetchedAt={fetchedAt} /></span>
              {task.estimatedMinutes && <span className="hint">of {fmtMinutes(task.estimatedMinutes)} estimated</span>}
            </div>
            <div className="actions">
              {isAssignee && (status === "TODO" || status === "PAUSED") && (
                <button className="btn btn-primary" disabled={busy} onClick={() => act("start", undefined, status === "TODO" ? "Task started" : "Resumed")}>
                  <Play size={16} /> {status === "TODO" ? "Start" : "Resume"}
                </button>
              )}
              {isAssignee && status === "IN_PROGRESS" && (
                <button className="btn" disabled={busy} onClick={() => act("pause", undefined, "Paused")}><Pause size={16} /> Pause</button>
              )}
              {isOwner && ["TODO", "IN_PROGRESS", "PAUSED"].includes(status) && (
                <button className="btn btn-success" disabled={busy} onClick={() => setDialog("complete")}><CheckCircle2 size={16} /> Mark complete</button>
              )}
              {isOwner && status === "COMPLETED" && (
                <button className="btn" disabled={busy} onClick={() => setDialog("review")}><Send size={16} /> Send to review</button>
              )}
              {status === "COMPLETED" && (isCreator || canManage) && (
                <button className="btn btn-primary" disabled={busy} onClick={() => act("end", undefined, "Task ended")}><Flag size={16} /> Mark as ended</button>
              )}
              {status === "IN_REVIEW" && (task.reviewerId === user.id || canManage) && (
                <>
                  <button className="btn btn-success" disabled={busy} onClick={() => act("review", { decision: "APPROVE" }, "Approved — task ended")}><ThumbsUp size={16} /> Approve</button>
                  <button className="btn btn-danger" disabled={busy} onClick={() => setDialog("reject")}><ThumbsDown size={16} /> Request changes</button>
                </>
              )}
              {status === "ENDED" && <span className="hint">This task is closed.</span>}
              {!isAssignee && !isOwner && status === "TODO" && <span className="hint">Only the assignee can start or complete this task.</span>}
            </div>
            {openSubs > 0 && ["TODO", "IN_PROGRESS", "PAUSED"].includes(status) && (
              <p className="hint" style={{ marginTop: 10 }}>{openSubs} sub-task(s) must be finished before this task can be completed.</p>
            )}
          </div>

          {/* ── Details ── */}
          <dl className="kv" style={{ marginBottom: 24 }}>
            <dt><UserRound size={14} style={{ verticalAlign: -2 }} /> Assignee</dt>
            <dd>{task.assignee ? <span className="user-cell"><Avatar name={task.assignee.name} small /> {task.assignee.name}</span> : <span className="hint">Unassigned</span>}</dd>
            <dt>Created by</dt><dd>{task.creator.name}</dd>
            {task.reviewer && <><dt>Reviewer</dt><dd>{task.reviewer.name}</dd></>}
            <dt><CalendarDays size={14} style={{ verticalAlign: -2 }} /> Due</dt><dd>{fmtDate(task.dueDate)}</dd>
            <dt>Created</dt><dd>{fmtDateTime(task.createdAt)}</dd>
          </dl>

          {task.description && (
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ marginBottom: 6 }}>Description</h4>
              <p style={{ whiteSpace: "pre-wrap", color: "#334155" }}>{task.description}</p>
            </div>
          )}

          {/* ── Sub-tasks ── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h4>Sub-tasks ({task.subtasks.length})</h4>
              {status !== "ENDED" && <button className="btn btn-sm" onClick={() => setSubOpen(true)}><Plus size={14} /> Add sub-task</button>}
            </div>
            {task.subtasks.length === 0 && <p className="hint">Break this task into smaller steps.</p>}
            {task.subtasks.map((s: any) => (
              <div key={s.id} className="subtask" onClick={() => setOpenId(s.id)}>
                <span style={{ flex: 1, fontWeight: 500 }}>{s.title}</span>
                {s.assignee && <Avatar name={s.assignee.name} small />}
                <StatusBadge status={s.status} />
              </div>
            ))}
          </div>

          {/* ── Activity ── */}
          <h4 style={{ marginBottom: 12 }}>Activity</h4>
          <ul className="timeline">
            {[...task.events].reverse().map((ev: any) => (
              <li key={ev.id}>
                <strong>{EVENT_LABEL[ev.type] ?? ev.type}</strong> <span className="hint">by {ev.actor.name}</span>
                {ev.note && <div style={{ color: "#475569" }}>“{ev.note}”</div>}
                <div className="when">{fmtDateTime(ev.at)}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {dialog === "complete" && (
        <Modal title="Mark task complete" onClose={() => setDialog(null)} footer={
          <>
            <button className="btn" onClick={() => setDialog(null)}>Cancel</button>
            <button className="btn btn-success" disabled={busy} onClick={() => act("complete", { ...(reviewerId && { reviewerId: Number(reviewerId) }), ...(note && { note }) }, reviewerId ? "Sent for review" : "Task completed")}>
              {reviewerId ? "Complete & send to review" : "Mark complete"}
            </button>
          </>
        }>
          <Field label="Send for review (optional)" hint="Leave empty to simply mark it complete — you can send it to review or end it later.">
            <select className="select" value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}>
              <option value="">No review</option>
              {reviewers.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
            </select>
          </Field>
          <Field label="Note" hint="Optional"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </Modal>
      )}

      {dialog === "review" && (
        <Modal title="Send to review" onClose={() => setDialog(null)} footer={
          <>
            <button className="btn" onClick={() => setDialog(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !reviewerId} onClick={() => act("request-review", { reviewerId: Number(reviewerId), ...(note && { note }) }, "Sent for review")}>Send</button>
          </>
        }>
          <Field label="Reviewer">
            <select className="select" value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}>
              <option value="">Select a person…</option>
              {reviewers.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
            </select>
          </Field>
          <Field label="Note" hint="Optional"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </Modal>
      )}

      {dialog === "reject" && (
        <Modal title="Request changes" onClose={() => setDialog(null)} footer={
          <>
            <button className="btn" onClick={() => setDialog(null)}>Cancel</button>
            <button className="btn btn-danger" disabled={busy || !note.trim()} onClick={() => act("review", { decision: "REJECT", note }, "Sent back to assignee")}>Send back</button>
          </>
        }>
          <Field label="What needs to change?"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} autoFocus /></Field>
        </Modal>
      )}

      {subOpen && (
        <TaskFormModal projectId={task.projectId} parentId={task.id} members={project.members} canManage={project.canManage}
          onClose={() => setSubOpen(false)} onCreated={() => { setSubOpen(false); toast("Sub-task created"); load(); onChanged(); }} />
      )}
    </div>
  );
}
