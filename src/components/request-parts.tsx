"use client";

import { useEffect, useState, type FormEvent } from "react";
import { X, Check, Ban, RotateCcw, CheckCheck, Undo2, Share2, ExternalLink, Trash2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { fmtDate, fmtDateTime, ROLE_LABEL } from "@/lib/client/format";
import { REQUEST_TYPES, REQUEST_TYPE_MAP, type FieldDef } from "@/lib/request-types";
import { Avatar, ConfirmDelete, Field, Loading, Modal, PriorityBadge, Spinner, useToast } from "./ui";
import { RichText, RichTextEditor } from "./rich-text";

const TONE: Record<string, [string, string]> = {
  PENDING: ["b-amber", "Pending"], RESUBMITTED: ["b-blue", "Resubmitted"], REJECTED: ["b-red", "Rejected"],
  APPROVED: ["b-green", "Approved"], COMPLETE: ["b-purple", "Complete"], CANCELLED: ["b-gray", "Cancelled"],
};
export function RequestStatus({ status }: { status: string }) {
  const [cls, label] = TONE[status] ?? ["b-gray", status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

const EVENT_LABEL: Record<string, string> = { SENT: "Request sent", REJECTED: "Rejected", RESUBMITTED: "Resubmitted", APPROVED: "Approved", COMPLETED: "Marked complete", CANCELLED: "Cancelled", REASSIGNED: "Reassigned" };

/** Sent → In review → Approved → Complete, with the rejected / resubmitted branch shown on "In review". */
export function Stepper({ status }: { status: string }) {
  const idx = status === "COMPLETE" ? 3 : status === "APPROVED" ? 2 : status === "CANCELLED" ? -1 : 1;
  const mid = status === "REJECTED" ? "Rejected" : status === "RESUBMITTED" ? "Resubmitted" : "Pending review";
  const steps = ["Sent", mid, "Approved", "Complete"];
  return (
    <ol className={`stepper${status === "CANCELLED" ? " cancelled" : ""}`} aria-label="Request progress">
      {steps.map((s, i) => (
        <li key={i} className={`${i < idx || status === "COMPLETE" ? "done" : ""}${i === idx && status !== "COMPLETE" ? " current" : ""}${i === 1 && status === "REJECTED" ? " bad" : ""}`}>
          <span className="dot">{i < idx || status === "COMPLETE" ? <Check size={12} /> : i + 1}</span>{s}
        </li>
      ))}
    </ol>
  );
}

export function DynamicFields({ type, values, onChange, errors = {} }: { type: string; values: Record<string, any>; onChange: (k: string, v: any) => void; errors?: Record<string, string[]> }) {
  const def = REQUEST_TYPE_MAP[type];
  const input = (f: FieldDef) => {
    const v = values[f.key] ?? "";
    if (f.kind === "textarea") return <textarea className="textarea" style={{ minHeight: 70 }} value={v} onChange={(e) => onChange(f.key, e.target.value)} placeholder={f.placeholder} />;
    if (f.kind === "select") return <select className="select" value={v} onChange={(e) => onChange(f.key, e.target.value)}><option value="">Select…</option>{f.options!.map((o) => <option key={o}>{o}</option>)}</select>;
    if (f.kind === "checkbox") return <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={!!values[f.key]} onChange={(e) => onChange(f.key, e.target.checked)} /> Yes</label>;
    return <input className="input" type={f.kind === "number" ? "number" : f.kind === "date" ? "date" : f.kind === "url" ? "url" : "text"} min={f.kind === "number" ? 0 : undefined} value={v} onChange={(e) => onChange(f.key, e.target.value)} placeholder={f.placeholder} />;
  };
  return (
    <>
      {def?.fields.map((f) => (
        <div className="field" key={f.key}>
          <label className="label">{f.label}{f.required && <span style={{ color: "var(--danger)" }}> *</span>}</label>
          {input(f)}
          {errors[f.key] && <span className="hint" style={{ color: "var(--danger)" }}>{errors[f.key][0]}</span>}
        </div>
      ))}
    </>
  );
}

function apiErrors(e: unknown): Record<string, string[]> {
  const d = (e as { data?: { error?: { fieldErrors?: Record<string, string[]> } } })?.data;
  return d?.error?.fieldErrors ?? {};
}

export function NewRequestModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [type, setType] = useState<string | null>(null);
  const [people, setPeople] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [f, setF] = useState({ title: "", description: "", priority: "MEDIUM", assigneeId: "", projectId: "", dueDate: "" });
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { Promise.all([api("/api/directory"), api("/api/projects")]).then(([d, p]) => { setPeople(d.users); setProjects(p.projects); }); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErrors({});
    try {
      const { request } = await api("/api/requests", {
        body: { type, title: f.title, priority: f.priority, assigneeId: Number(f.assigneeId), data: answers,
          ...(f.description && { description: f.description }), ...(f.projectId && { projectId: Number(f.projectId) }), ...(f.dueDate && { dueDate: f.dueDate }) },
      });
      toast("Request sent");
      onCreated(request.id);
    } catch (err) {
      setErrors(apiErrors(err));
      toast(err instanceof Error ? err.message : "Failed", true);
      setBusy(false);
    }
  }
  void user;

  if (!type) {
    return (
      <Modal title="New request" onClose={onClose} wide>
        <p className="hint" style={{ marginBottom: 14 }}>What do you need? Pick a type — each one has its own form.</p>
        <div className="type-grid">
          {REQUEST_TYPES.map((t) => <button key={t.value} className="type-card" onClick={() => { setType(t.value); setF((s) => ({ ...s, title: s.title })); }}><b>{t.label}</b><span>{t.blurb}</span></button>)}
        </div>
      </Modal>
    );
  }
  const def = REQUEST_TYPE_MAP[type];
  return (
    <Modal title={`New ${def.label.toLowerCase()}`} onClose={onClose} wide
      footer={<><button className="btn" type="button" onClick={() => setType(null)}>Back</button><button className="btn btn-primary" form="reqform" disabled={busy}>{busy ? <Spinner /> : "Send request"}</button></>}>
      <form id="reqform" onSubmit={submit}>
        <Field label="Title"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={3} autoFocus placeholder={`e.g. ${def.label} for …`} /></Field>
        <div className="row">
          <Field label="Send to"><select className="select" value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value })} required>
            <option value="">Select a person…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.designation || ROLE_LABEL[p.role]}</option>)}</select></Field>
          <Field label="Priority"><select className="select" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>)}</select></Field>
        </div>
        <div className="row">
          <Field label="Project" hint="Optional"><select className="select" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}><option value="">None</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Needed by" hint="Optional"><input type="date" className="input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        </div>
        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "4px 0 16px" }} />
        <DynamicFields type={type} values={answers} onChange={(k, v) => setAnswers((a) => ({ ...a, [k]: v }))} errors={errors} />
        <Field label={type === "OTHER" ? "Details" : "Additional notes"} hint="Optional — supports formatting"><RichTextEditor value={f.description} onChange={(html) => setF((s) => ({ ...s, description: html }))} /></Field>
      </form>
    </Modal>
  );
}

/** Detail view with the full flow and the actions each person is allowed to take. */
export function RequestDrawer({ requestId, onClose, onChanged }: { requestId: number; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [r, setR] = useState<any>(null);
  const [dialog, setDialog] = useState<null | "reject" | "complete" | "resubmit" | "reassign" | "approve" | "delete">(null);
  const [note, setNote] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<any[]>([]);
  const [to, setTo] = useState("");

  const load = () => api(`/api/requests/${requestId}`).then((d) => setR(d.request));
  useEffect(() => {
    load().catch((e) => { toast(e.message, true); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  async function act(action: string, body: unknown, ok: string) {
    setBusy(true);
    try { await api(`/api/requests/${requestId}/${action}`, { body }); toast(ok); setDialog(null); setNote(""); setResult(""); await load(); onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
    finally { setBusy(false); }
  }

  if (!r || !user) return <div className="drawer-overlay"><div className="drawer"><Loading /></div></div>;
  const def = REQUEST_TYPE_MAP[r.type];
  const isAssignee = r.assigneeId === user.id, isRequester = r.requesterId === user.id;
  const open = ["PENDING", "RESUBMITTED"].includes(r.status);
  const admin = user.role === "SUPER_ADMIN" || user.role === "COMPANY_HEAD";
  const canDelete = admin || (isRequester && ["PENDING", "RESUBMITTED", "REJECTED", "CANCELLED"].includes(r.status));
  const value = (f: FieldDef) => {
    const v = r.data?.[f.key];
    if (v === undefined || v === "" || v === null) return <span className="hint">—</span>;
    if (f.kind === "checkbox") return v ? "Yes" : "No";
    if (f.kind === "url") return <a href={String(v)} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>{String(v)} <ExternalLink size={12} /></a>;
    if (f.kind === "date") return fmtDate(String(v));
    return <span style={{ whiteSpace: "pre-wrap" }}>{String(v)}</span>;
  };

  return (
    <div className="drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="drawer-head">
          <div>
            <div className="crumbs">{def.label} · #{r.id}</div>
            <h2 style={{ fontSize: 20 }}>{r.title}</h2>
            <div className="actions" style={{ marginTop: 8 }}><RequestStatus status={r.status} /><PriorityBadge priority={r.priority} />{r.resubmitCount > 0 && <span className="badge b-gray">Resubmitted ×{r.resubmitCount}</span>}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="drawer-body">
          <Stepper status={r.status} />

          {r.status === "REJECTED" && (
            <div className="alert alert-error" style={{ marginTop: 16 }}><b>Rejected by {r.assignee.name}:</b> {r.decisionNote}{isRequester && <div style={{ marginTop: 4 }}>Edit your request to address this and resubmit it.</div>}</div>
          )}
          {r.status === "COMPLETE" && r.resultUrl && <div className="alert alert-info" style={{ marginTop: 16 }}>Done. <a href={r.resultUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{def.resultLabel} <ExternalLink size={12} /></a></div>}
          {(r.status === "APPROVED" || r.status === "COMPLETE") && r.decisionNote && <p className="hint" style={{ marginTop: 10 }}>Note from {r.assignee.name}: “{r.decisionNote}”</p>}

          <div className="actions" style={{ margin: "18px 0 22px" }}>
            {isAssignee && open && <>
              <button className="btn btn-success" disabled={busy} onClick={() => { setNote(""); setDialog("approve"); }}><Check size={16} /> Approve</button>
              <button className="btn btn-danger" disabled={busy} onClick={() => { setNote(""); setDialog("reject"); }}><Ban size={16} /> Reject</button></>}
            {isAssignee && r.status === "APPROVED" && <button className="btn btn-primary" disabled={busy} onClick={() => { setNote(""); setDialog("complete"); }}><CheckCheck size={16} /> Mark complete</button>}
            {isRequester && r.status === "REJECTED" && <button className="btn btn-primary" disabled={busy} onClick={() => setDialog("resubmit")}><RotateCcw size={16} /> Edit & resubmit</button>}
            {(isAssignee || isRequester) && ["PENDING", "RESUBMITTED", "APPROVED", "REJECTED"].includes(r.status) && (
              <button className="btn" disabled={busy} onClick={() => { api("/api/directory").then((d) => setPeople(d.users)); setTo(""); setDialog("reassign"); }}><Share2 size={16} /> Reassign</button>)}
            {isRequester && ["PENDING", "RESUBMITTED", "APPROVED", "REJECTED"].includes(r.status) && <button className="btn" disabled={busy} onClick={() => act("cancel", {}, "Request cancelled")}><Undo2 size={16} /> Cancel request</button>}
            {canDelete && <button className="btn btn-ghost" disabled={busy} onClick={() => setDialog("delete")} style={{ color: "var(--danger)" }}><Trash2 size={16} /> Delete</button>}
          </div>

          <dl className="kv" style={{ marginBottom: 20 }}>
            <dt>From</dt><dd className="user-cell"><Avatar name={r.requester.name} small />{r.requester.name}</dd>
            <dt>Assigned to</dt><dd className="user-cell"><Avatar name={r.assignee.name} small />{r.assignee.name}</dd>
            {r.project && <><dt>Project</dt><dd>{r.project.name}</dd></>}
            <dt>Needed by</dt><dd>{fmtDate(r.dueDate)}</dd>
            <dt>Sent</dt><dd>{fmtDateTime(r.createdAt)}</dd>
          </dl>

          {def.fields.length > 0 && <>
            <h4 style={{ marginBottom: 8 }}>Request details</h4>
            <dl className="kv" style={{ marginBottom: 20 }}>{def.fields.map((f) => <div key={f.key} style={{ display: "contents" }}><dt>{f.label}</dt><dd>{value(f)}</dd></div>)}</dl>
          </>}
          {r.description && <><h4 style={{ marginBottom: 8 }}>Notes</h4><div style={{ marginBottom: 20 }}><RichText html={r.description} /></div></>}

          <h4 style={{ marginBottom: 12 }}>History</h4>
          <ul className="timeline">
            {[...r.events].reverse().map((ev: any) => (
              <li key={ev.id}><strong>{EVENT_LABEL[ev.type] ?? ev.type}</strong> <span className="hint">by {ev.actor.name}</span>{ev.note && <div style={{ color: "#475569" }}>“{ev.note}”</div>}<div className="when">{fmtDateTime(ev.at)}</div></li>
            ))}
          </ul>
        </div>
      </div>

      {dialog === "delete" && (
        <ConfirmDelete title="Delete this request?" onClose={() => setDialog(null)} onConfirm={async () => {
          await api(`/api/requests/${r.id}`, { method: "DELETE" }); toast("Request deleted"); onChanged(); onClose();
        }}>
          <b>{r.title}</b> and its whole history will be removed for you and {isRequester ? r.assignee.name : r.requester.name}.
          {["PENDING", "RESUBMITTED"].includes(r.status) && <> It is still waiting on {r.assignee.name} — consider <i>Cancel request</i> if you want to keep a record.</>}
        </ConfirmDelete>
      )}
      {dialog === "approve" && <Modal title="Approve request" onClose={() => setDialog(null)} footer={<><button className="btn" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-success" disabled={busy} onClick={() => act("approve", note ? { note } : {}, "Request approved")}>Approve</button></>}>
        <p className="hint" style={{ marginBottom: 12 }}>After approving, you can mark it complete once the work is done.</p>
        <Field label="Note" hint="Optional"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} autoFocus /></Field></Modal>}

      {dialog === "reject" && <Modal title="Reject request" onClose={() => setDialog(null)} footer={<><button className="btn" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-danger" disabled={busy || !note.trim()} onClick={() => act("reject", { note }, "Request rejected")}>Reject</button></>}>
        <p className="hint" style={{ marginBottom: 12 }}>{r.requester.name} will see your reason and can edit and resubmit.</p>
        <Field label="Reason for rejecting"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} autoFocus /></Field></Modal>}

      {dialog === "complete" && <Modal title="Mark as complete" onClose={() => setDialog(null)} footer={<><button className="btn" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={() => act("complete", { ...(result && { resultUrl: result }), ...(note && { note }) }, "Marked complete")}>Mark complete</button></>}>
        <Field label={def.resultLabel} hint="Optional link"><input type="url" className="input" value={result} onChange={(e) => setResult(e.target.value)} placeholder="https://…" autoFocus /></Field>
        <Field label="Note" hint="Optional"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field></Modal>}

      {dialog === "reassign" && <Modal title="Reassign request" onClose={() => setDialog(null)} footer={<><button className="btn" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !to} onClick={() => act("reassign", { assigneeId: Number(to), ...(note && { note }) }, "Request reassigned")}>Reassign</button></>}>
        <Field label="Hand over to"><select className="select" value={to} onChange={(e) => setTo(e.target.value)}><option value="">Select a person…</option>{people.filter((p) => p.id !== r.assigneeId && p.id !== r.requesterId).map((p) => <option key={p.id} value={p.id}>{p.name} — {p.designation || ROLE_LABEL[p.role]}</option>)}</select></Field>
        <Field label="Note" hint="Optional"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field></Modal>}

      {dialog === "resubmit" && <ResubmitModal r={r} onClose={() => setDialog(null)} onDone={async () => { setDialog(null); toast("Request resubmitted"); await load(); onChanged(); }} />}
    </div>
  );
}

function ResubmitModal({ r, onClose, onDone }: { r: any; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(r.title);
  const [description, setDescription] = useState<string>(r.description ?? "");
  const [answers, setAnswers] = useState<Record<string, any>>(r.data ?? {});
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErrors({});
    try { await api(`/api/requests/${r.id}/resubmit`, { body: { title, description: description || null, data: answers, ...(note && { note }) } }); onDone(); }
    catch (err) { setErrors(apiErrors(err)); toast(err instanceof Error ? err.message : "Failed", true); setBusy(false); }
  }
  return (
    <Modal title="Edit & resubmit" onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="resub" disabled={busy}>{busy ? <Spinner /> : "Resubmit"}</button></>}>
      <form id="resub" onSubmit={submit}>
        <div className="alert alert-error"><b>Rejected:</b> {r.decisionNote}</div>
        <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} /></Field>
        <DynamicFields type={r.type} values={answers} onChange={(k, v) => setAnswers((a) => ({ ...a, [k]: v }))} errors={errors} />
        <Field label="Notes"><RichTextEditor value={description} onChange={setDescription} /></Field>
        <Field label="What did you change?" hint="Optional — shown to the reviewer"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </form>
    </Modal>
  );
}
