"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Play, Pause, CheckCircle2, Send, Flag, ThumbsUp, ThumbsDown, Plus, CalendarDays, Timer, Users, Ban, Pencil, MessageSquare, Trash2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { fmtDateTime, fmtDate, fmtDuration, fmtMinutes } from "@/lib/client/format";
import { useNotifications } from "@/lib/client/notifications";
import { PalNo } from "./pal-no";
import { Avatar, ConfirmDelete, Loading, Modal, PriorityBadge, StatusBadge, useToast, Field } from "./ui";
import { TaskFormModal, PeoplePicker, assignableMembers, type Member } from "./task-form";
import { RichText, RichTextEditor } from "./rich-text";

const EVENT_LABEL: Record<string, string> = {
  CREATED: "Task created", ASSIGNED: "Assignment changed", ASSIGNMENT_REJECTED: "Assignment declined", STARTED: "Started", PAUSED: "Paused", RESUMED: "Resumed",
  COMPLETED: "Marked complete", REVIEW_REQUESTED: "Sent for review", APPROVED: "Review approved", REJECTED: "Changes requested", ENDED: "Task ended",
};

/** Ticks once a second; each running assignee adds one second per second to the task total. */
function Elapsed({ seconds, running, fetchedAt }: { seconds: number; running: number; fetchedAt: number }) {
  const [now, setNow] = useState(() => fetchedAt);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtDuration(seconds + running * Math.max(0, now - fetchedAt) / 1000, true)}</span>;
}

export function TaskDrawer({ taskId, onClose, onChanged }: { taskId: number; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const { unreadTaskIds, markRead } = useNotifications();
  const [task, setTask] = useState<any>(null);
  const [project, setProject] = useState<{ members: Member[]; canManage: boolean } | null>(null);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dialog, setDialog] = useState<null | "complete" | "review" | "reject" | "decline" | "assignees">(null);
  const [reviewerId, setReviewerId] = useState("");
  const [note, setNote] = useState("");
  const [subOpen, setSubOpen] = useState(false);
  const [openId, setOpenId] = useState(taskId);
  const [editDesc, setEditDesc] = useState<string | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [comment, setComment] = useState("");

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

  async function call(path: string, body: unknown, ok: string, method = "POST") {
    setBusy(true);
    try {
      const r = await api(`/api/tasks/${task.id}${path}`, { method, body: body ?? undefined });
      toast(typeof ok === "string" ? ok : "Updated");
      setDialog(null); setNote(""); setEditDesc(null);
      await load();
      onChanged();
      return r;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", true);
    } finally {
      setBusy(false);
    }
  }
  async function postComment() {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await api(`/api/tasks/${task.id}/comments`, { method: "POST", body: { body: comment } });
      setComment("");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", true);
    } finally {
      setBusy(false);
    }
  }
  const act = (path: string, body?: unknown, ok = "Updated") => call(`/${path}`, body, ok);

  if (!task || !project || !user) return <div className="drawer-overlay"><div className="drawer"><Loading /></div></div>;

  const status = task.status as string;
  const active = task.assignees.filter((a: any) => a.status === "ASSIGNED");
  const declined = task.assignees.filter((a: any) => a.status === "REJECTED");
  const mine = task.mine;
  const isOwner = active.length ? !!mine : task.createdById === user.id;
  const isCreator = task.createdById === user.id;
  const { canManage } = project;
  const isEditor = isCreator || canManage;
  // same rule as the API: project managers, or the creator while nobody has started it
  const canDelete = canManage || (isCreator && status === "TODO");
  const closed = ["COMPLETED", "IN_REVIEW", "ENDED"].includes(status);
  const reviewers = project.members.filter((m) => !active.some((a: any) => a.userId === m.user.id));
  const openSubs = task.subtasks.filter((s: any) => !["COMPLETED", "ENDED"].includes(s.status)).length;
  const waitingOn = active.filter((a: any) => !a.doneAt && a.userId !== user.id).length;
  const canDecline = mine && !mine.startedAt && !mine.workedSeconds && !mine.doneAt && !closed;
  const assignOptions = assignableMembers(project.members, user, canManage);
  const lockedIds = isEditor
    ? active.filter((a: any) => a.startedAt || a.workedSeconds > 0 || a.doneAt).map((a: any) => a.userId)
    : active.map((a: any) => a.userId); // non-editors can only add people

  const state = (a: any) => (a.doneAt ? ["Finished", "b-green"] : a.isRunning ? ["Working", "b-blue"] : a.startedAt ? ["Paused", "b-amber"] : ["Not started", "b-gray"]);

  return (
    <div className="drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="drawer-head">
          <div>
            <div className="crumbs"><PalNo n={task.palNo} copy /> {task.project.name}{task.parent && <> <span>›</span> <a className="parent-link" onClick={() => setOpenId(task.parent.id)} title="Open the parent task">↑ {task.parent.title}</a></>}</div>
            <h2 style={{ fontSize: 20 }}>{task.title}</h2>
            <div className="actions" style={{ marginTop: 8 }}>
              <StatusBadge status={status} /> <PriorityBadge priority={task.priority} />
              {task.parent && <span className="badge b-gray">Sub-task</span>}
              {task.runningCount > 0 && <span className="badge b-green"><span className="timer-dot" /> {task.runningCount} working now</span>}
              {active.length > 1 && <span className="badge b-gray"><Users size={12} /> Shared · {active.length}</span>}
            </div>
          </div>
          <div className="actions" style={{ alignSelf: "flex-start" }}>
            {canDelete && <button className="btn btn-ghost btn-sm" onClick={() => setDeleting(true)} title="Delete task" aria-label="Delete task"><Trash2 size={18} /></button>}
            <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X size={20} /></button>
          </div>
        </div>

        <div className="drawer-body">
          {/* ── My actions + total time ── */}
          <div className="card card-pad" style={{ marginBottom: 24, background: "#fafbff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <Timer size={18} color="var(--primary)" />
              <span style={{ fontSize: 26, fontWeight: 700 }}><Elapsed seconds={task.workedSeconds} running={task.runningCount} fetchedAt={fetchedAt} /></span>
              <span className="hint">{active.length > 1 ? "total, all assignees" : "tracked"}{task.estimatedMinutes ? ` · of ${fmtMinutes(task.estimatedMinutes)} estimated` : ""}</span>
            </div>
            <div className="actions" style={{ marginTop: 10 }}>
              {mine && !mine.doneAt && !closed && !mine.isRunning && (
                <button className="btn btn-primary" disabled={busy} onClick={() => act("start", undefined, mine.startedAt ? "Resumed" : "Timer started")}><Play size={16} /> {mine.startedAt ? "Resume my timer" : "Start my timer"}</button>
              )}
              {mine?.isRunning && <button className="btn" disabled={busy} onClick={() => act("pause", undefined, "Paused")}><Pause size={16} /> Pause my timer</button>}
              {isOwner && ["TODO", "IN_PROGRESS", "PAUSED"].includes(status) && !mine?.doneAt && (
                <button className="btn btn-success" disabled={busy} onClick={() => setDialog("complete")}><CheckCircle2 size={16} /> {active.length > 1 ? "Mark my part complete" : "Mark complete"}</button>
              )}
              {canDecline && <button className="btn" disabled={busy} onClick={() => setDialog("decline")}><Ban size={16} /> Decline task</button>}
              {isOwner && status === "COMPLETED" && <button className="btn" disabled={busy} onClick={() => setDialog("review")}><Send size={16} /> Send to review</button>}
              {status === "COMPLETED" && isEditor && <button className="btn btn-primary" disabled={busy} onClick={() => act("end", undefined, "Task ended")}><Flag size={16} /> Mark as ended</button>}
              {status === "IN_REVIEW" && (task.reviewerId === user.id || canManage) && (
                <>
                  <button className="btn btn-success" disabled={busy} onClick={() => act("review", { decision: "APPROVE" }, "Approved — task ended")}><ThumbsUp size={16} /> Approve</button>
                  <button className="btn btn-danger" disabled={busy} onClick={() => setDialog("reject")}><ThumbsDown size={16} /> Request changes</button>
                </>
              )}
              {status === "ENDED" && <span className="hint">This task is closed.</span>}
              {!mine && !isOwner && !closed && <span className="hint">Only the assignees can start or complete this task.</span>}
            </div>
            {mine?.doneAt && !closed && <p className="hint" style={{ marginTop: 10 }}>You finished your part{waitingOn ? ` — waiting for ${waitingOn} other${waitingOn > 1 ? "s" : ""}.` : "."}</p>}
            {openSubs > 0 && ["TODO", "IN_PROGRESS", "PAUSED"].includes(status) && <p className="hint" style={{ marginTop: 10 }}>{openSubs} sub-task(s) must be finished before this task can be completed.</p>}
          </div>

          {/* ── Assignees ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h4>Assigned to ({active.length})</h4>
              {!closed && <button className="btn btn-sm" onClick={() => { setPicked(active.map((a: any) => a.userId)); setDialog("assignees"); }}><Users size={14} /> Manage</button>}
            </div>
            {active.length === 0 && (
              <p className="hint">Nobody is assigned.{" "}
                {!closed && <a style={{ cursor: "pointer", color: "var(--primary)", fontWeight: 600 }} onClick={() => call("", { assigneeIds: [user.id] }, "Task assigned to you", "PATCH")}>Take this task</a>}</p>
            )}
            {active.map((a: any) => {
              const [lbl, tone] = state(a);
              return (
                <div key={a.id} className="subtask" style={{ cursor: "default" }}>
                  <Avatar name={a.user.name} small />
                  <span style={{ flex: 1, fontWeight: 500 }}>{a.user.name}{a.userId === user.id ? " (you)" : ""}</span>
                  {a.isRunning && <span className="timer-dot" />}
                  <span className="hint mono">{a.isRunning ? <Elapsed seconds={a.liveSeconds} running={1} fetchedAt={fetchedAt} /> : fmtDuration(a.liveSeconds, true)}</span>
                  <span className={`badge ${tone}`}>{lbl}</span>
                </div>
              );
            })}
            {declined.map((a: any) => (
              <div key={a.id} className="subtask declined" style={{ cursor: "default" }}>
                <Avatar name={a.user.name} small />
                <span style={{ flex: 1 }}><b>{a.user.name}</b> declined<div className="hint">“{a.rejectReason}”</div></span>
                <span className="badge b-red">Declined</span>
              </div>
            ))}
          </div>

          <dl className="kv" style={{ marginBottom: 24 }}>
            <dt>Created by</dt><dd>{task.creator.name}</dd>
            {task.reviewer && <><dt>Reviewer</dt><dd>{task.reviewer.name}</dd></>}
            <dt><CalendarDays size={14} style={{ verticalAlign: -2 }} /> Due</dt><dd>{fmtDate(task.dueDate)}</dd>
            <dt>Created</dt><dd>{fmtDateTime(task.createdAt)}</dd>
          </dl>

          {/* ── Description ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h4>Description</h4>
              {isEditor && status !== "ENDED" && editDesc === null && <button className="btn btn-ghost btn-sm" onClick={() => setEditDesc(task.description ?? "")}><Pencil size={14} /> Edit</button>}
            </div>
            {editDesc !== null ? (
              <>
                <RichTextEditor value={editDesc} onChange={setEditDesc} minHeight={140} autoFocus />
                <div className="actions" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => call("", { description: editDesc || null }, "Description saved", "PATCH")}>Save</button>
                  <button className="btn btn-sm" onClick={() => setEditDesc(null)}>Cancel</button>
                </div>
              </>
            ) : task.description ? <RichText html={task.description} /> : <p className="hint">No description.</p>}
          </div>

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
                <div className="avatar-stack">{s.assignees.filter((a: any) => a.status === "ASSIGNED").slice(0, 3).map((a: any) => <Avatar key={a.id} name={a.user.name} small />)}</div>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </div>

          {/* ── Comments / doubts ── */}
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ marginBottom: 12 }}><MessageSquare size={14} style={{ verticalAlign: -2 }} /> Comments &amp; doubts ({task.comments.length})</h4>
            {task.comments.length === 0 && <p className="hint">No comments yet. Ask a question about this task below.</p>}
            {task.comments.map((c: any) => (
              <div key={c.id} className="subtask" style={{ cursor: "default", alignItems: "flex-start" }}>
                <Avatar name={c.author.name} small />
                <div style={{ flex: 1 }}>
                  <div><b>{c.author.name}{c.author.id === user.id ? " (you)" : ""}</b> <span className="hint">{fmtDateTime(c.createdAt)}</span></div>
                  <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{c.body}</div>
                </div>
              </div>
            ))}
            <textarea className="textarea" rows={2} maxLength={2000} placeholder="Ask a doubt or add a comment…" value={comment} onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) postComment(); }} style={{ width: "100%", marginTop: 8 }} />
            <div className="actions" style={{ marginTop: 8 }}>
              <button className="btn btn-primary btn-sm" disabled={busy || !comment.trim()} onClick={postComment}><Send size={14} /> Post</button>
            </div>
          </div>

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
        <Modal title={active.length > 1 ? "Finish my part" : "Mark task complete"} onClose={() => setDialog(null)} footer={
          <><button className="btn" onClick={() => setDialog(null)}>Cancel</button>
            <button className="btn btn-success" disabled={busy} onClick={() => act("complete", { ...(reviewerId && { reviewerId: Number(reviewerId) }), ...(note && { note }) }, "Marked complete")}>{reviewerId ? "Complete & send to review" : "Mark complete"}</button></>
        }>
          {waitingOn > 0 && <div className="alert alert-info">{waitingOn} other assignee(s) are still working. The task completes when everyone has finished.</div>}
          <Field label="Send for review (optional)" hint="Applies when the task is fully finished. You can also send it to review or end it later.">
            <select className="select" value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}>
              <option value="">No review</option>
              {reviewers.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
            </select>
          </Field>
          <Field label="Note" hint="Optional"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </Modal>
      )}

      {dialog === "decline" && (
        <Modal title="Decline this task" onClose={() => setDialog(null)} footer={
          <><button className="btn" onClick={() => setDialog(null)}>Cancel</button>
            <button className="btn btn-danger" disabled={busy || note.trim().length < 5} onClick={() => act("reject", { reason: note }, "Task declined — the owner has been told")}>Decline task</button></>
        }>
          <p className="hint" style={{ marginBottom: 12 }}>The reason is sent to <b>{task.creator.name}</b>, who can then reassign it. You can only decline before you start working on it.</p>
          <Field label="Why are you declining?"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} autoFocus placeholder="e.g. I’m on leave that week / this needs access I don’t have…" /></Field>
        </Modal>
      )}

      {dialog === "review" && (
        <Modal title="Send to review" onClose={() => setDialog(null)} footer={
          <><button className="btn" onClick={() => setDialog(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !reviewerId} onClick={() => act("request-review", { reviewerId: Number(reviewerId), ...(note && { note }) }, "Sent for review")}>Send</button></>
        }>
          <Field label="Reviewer"><select className="select" value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}><option value="">Select a person…</option>{reviewers.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}</select></Field>
          <Field label="Note" hint="Optional"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </Modal>
      )}

      {dialog === "reject" && (
        <Modal title="Request changes" onClose={() => setDialog(null)} footer={
          <><button className="btn" onClick={() => setDialog(null)}>Cancel</button>
            <button className="btn btn-danger" disabled={busy || !note.trim()} onClick={() => act("review", { decision: "REJECT", note }, "Sent back to the assignees")}>Send back</button></>
        }>
          <Field label="What needs to change?"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} autoFocus /></Field>
        </Modal>
      )}

      {dialog === "assignees" && (
        <Modal title="Who is working on this task?" onClose={() => setDialog(null)} footer={
          <><button className="btn" onClick={() => setDialog(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => call("", { assigneeIds: picked }, "Assignees updated", "PATCH")}>Save</button></>
        }>
          <p className="hint" style={{ marginBottom: 12 }}>Each person has their own timer. Anyone who has already started can’t be removed.</p>
          <PeoplePicker options={assignOptions} value={picked} onChange={setPicked} meId={user.id} locked={lockedIds} />
        </Modal>
      )}

      {deleting && (
        <ConfirmDelete title="Delete this task?" onClose={() => setDeleting(false)} onConfirm={async () => {
          const r = await api(`/api/tasks/${task.id}`, { method: "DELETE" });
          toast(r.deleted > 1 ? `Task and ${r.deleted - 1} sub-task(s) deleted` : "Task deleted");
          onChanged(); onClose();
        }}>
          <b>{task.title}</b> will be removed with its comments, activity log and logged time
          {task.subtasks.length > 0 && <>, <b>and all {task.subtasks.length} sub-task{task.subtasks.length > 1 ? "s" : ""}</b> (including theirs)</>}.
        </ConfirmDelete>
      )}
      {subOpen && (
        <TaskFormModal projectId={task.projectId} parentId={task.id} members={project.members} canManage={project.canManage}
          onClose={() => setSubOpen(false)} onCreated={() => { setSubOpen(false); toast("Sub-task created"); load(); onChanged(); }} />
      )}
    </div>
  );
}
