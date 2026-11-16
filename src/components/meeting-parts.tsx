"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { X, Video, MapPin, Clock, Pencil, XCircle, Check, HelpCircle, Users } from "lucide-react";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { fmtDayHeading, fmtTime, isoToIst, istToIso, ROLE_LABEL } from "@/lib/client/format";
import { Avatar, Field, Loading, Modal, Spinner, useToast } from "./ui";
import { PeoplePicker } from "./task-form";
import { RichText, RichTextEditor } from "./rich-text";

export const RSVP_TONE: Record<string, [string, string]> = {
  INVITED: ["b-gray", "Invited"], ACCEPTED: ["b-green", "Going"], DECLINED: ["b-red", "Declined"], TENTATIVE: ["b-amber", "Maybe"],
};

/** "live" while it is on, "soon" in the 15 minutes before it starts. */
export function meetingPhase(m: { startsAt: string; endsAt: string; status: string }, now = Date.now()) {
  if (m.status === "CANCELLED") return "cancelled";
  const s = new Date(m.startsAt).getTime(), e = new Date(m.endsAt).getTime();
  if (now >= s && now < e) return "live";
  if (now < s && s - now <= 15 * 60_000) return "soon";
  return now >= e ? "past" : "later";
}

export const timeRange = (m: { startsAt: string; endsAt: string }) => `${fmtTime(m.startsAt)} – ${fmtTime(m.endsAt)}`;

export function MeetingFormModal({ meeting, onClose, onSaved }: { meeting?: any; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const start = meeting ? isoToIst(meeting.startsAt) : null;
  const end = meeting ? isoToIst(meeting.endsAt) : null;
  const today = isoToIst(new Date().toISOString()).date;
  const [f, setF] = useState({
    title: meeting?.title ?? "", agenda: meeting?.agenda ?? "", link: meeting?.link ?? "", location: meeting?.location ?? "",
    date: start?.date ?? today, startTime: start?.time ?? "10:00", endTime: end?.time ?? "11:00", projectId: meeting?.projectId ? String(meeting.projectId) : "",
  });
  const [ids, setIds] = useState<number[]>(meeting ? meeting.attendees.map((a: any) => a.userId) : []);
  const [people, setPeople] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { Promise.all([api("/api/directory"), api("/api/projects")]).then(([d, p]) => { setPeople(d.users); setProjects(p.projects.filter((x: any) => x.status !== "ARCHIVED")); }); }, []);
  const options = useMemo(() => people.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())).map((p) => ({ user: p })), [people, q]);

  async function addProjectMembers() {
    if (!f.projectId) return;
    const r = await api(`/api/projects/${f.projectId}`);
    const memberIds: number[] = r.project.members.map((m: any) => m.user.id).filter((id: number) => id !== user!.id);
    setIds((cur) => [...new Set([...cur, ...memberIds])]);
    toast(`Added ${memberIds.length} project member(s)`);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (f.endTime <= f.startTime) return setErr("End time must be after the start time");
    setBusy(true);
    try {
      const body = {
        title: f.title, agenda: f.agenda || (meeting ? null : undefined), link: f.link || (meeting ? null : undefined), location: f.location || (meeting ? null : undefined),
        startsAt: istToIso(f.date, f.startTime), endsAt: istToIso(f.date, f.endTime),
        projectId: f.projectId ? Number(f.projectId) : null, attendeeIds: ids,
      };
      const r = meeting ? await api(`/api/meetings/${meeting.id}`, { method: "PATCH", body }) : await api("/api/meetings", { body });
      const n = r.conflicts?.length ?? 0;
      toast(n ? `${meeting ? "Updated" : "Scheduled"} — heads-up: it overlaps ${n} other meeting${n > 1 ? "s" : ""} (e.g. “${r.conflicts[0].title}”)` : meeting ? "Meeting updated" : "Meeting scheduled");
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); setBusy(false); }
  }

  return (
    <Modal title={meeting ? "Edit meeting" : "Schedule a meeting"} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="mform" disabled={busy}>{busy ? <Spinner /> : meeting ? "Save changes" : "Schedule & invite"}</button></>}>
      <form id="mform" onSubmit={submit}>
        {err && <div className="alert alert-error">{err}</div>}
        <Field label="Title"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required autoFocus placeholder="e.g. Sprint planning" /></Field>
        <div className="row">
          <Field label="Date (IST)"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></Field>
          <Field label="Starts"><input type="time" className="input" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} required /></Field>
          <Field label="Ends"><input type="time" className="input" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} required /></Field>
        </div>
        <div className="row">
          <Field label="Meeting link" hint="Zoom, Google Meet, Teams…"><input type="url" className="input" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://meet.google.com/…" /></Field>
          <Field label="Location" hint="Optional — room or address"><input className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
        </div>
        <Field label="Project" hint="Optional">
          <div style={{ display: "flex", gap: 8 }}>
            <select className="select" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}><option value="">No project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            {f.projectId && <button type="button" className="btn" onClick={addProjectMembers}><Users size={15} /> Invite team</button>}
          </div>
        </Field>
        <Field label={`Attendees (${ids.length})`} hint="Optional — everyone you pick is notified.">
          <input className="input" style={{ marginBottom: 8 }} placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
          <PeoplePicker options={options} value={ids} onChange={setIds} meId={user!.id} />
        </Field>
        <Field label="Agenda" hint="Optional — supports formatting"><RichTextEditor value={f.agenda} onChange={(html) => setF((s) => ({ ...s, agenda: html }))} placeholder="Topics to cover, goals, pre-reads…" minHeight={110} /></Field>
      </form>
    </Modal>
  );
}

export function MeetingDrawer({ meetingId, onClose, onChanged }: { meetingId: number; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [m, setM] = useState<any>(null);
  const [edit, setEdit] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const load = () => api(`/api/meetings/${meetingId}`).then((d) => setM(d.meeting));
  useEffect(() => {
    load().catch((e) => { toast(e.message, true); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  if (!m || !user) return <div className="drawer-overlay"><div className="drawer"><Loading /></div></div>;
  const mine = m.attendees.find((a: any) => a.userId === user.id);
  const isOrganizer = m.organizerId === user.id;
  const canManage = isOrganizer || user.role === "SUPER_ADMIN" || user.role === "COMPANY_HEAD";
  const phase = meetingPhase(m);
  const counts = m.attendees.reduce((c: Record<string, number>, a: any) => ({ ...c, [a.response]: (c[a.response] ?? 0) + 1 }), {});

  async function rsvp(response: string) {
    try { await api(`/api/meetings/${m.id}/respond`, { body: { response } }); toast("Response saved"); await load(); onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
  }
  async function cancel() {
    try { await api(`/api/meetings/${m.id}/cancel`, { body: reason ? { reason } : {} }); toast("Meeting cancelled"); setCancelling(false); await load(); onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
  }

  return (
    <div className="drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="drawer-head">
          <div>
            <div className="crumbs">{fmtDayHeading(m.startsAt)}</div>
            <h2 style={{ fontSize: 20, textDecoration: m.status === "CANCELLED" ? "line-through" : undefined }}>{m.title}</h2>
            <div className="actions" style={{ marginTop: 8 }}>
              <span className="badge b-gray"><Clock size={12} /> {timeRange(m)} IST</span>
              {phase === "live" && <span className="badge b-green"><span className="timer-dot" /> Happening now</span>}
              {phase === "soon" && <span className="badge b-amber">Starting soon</span>}
              {m.status === "CANCELLED" && <span className="badge b-red">Cancelled</span>}
              {m.project && <span className="badge b-purple">{m.project.name}</span>}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="drawer-body">
          <div className="actions" style={{ marginBottom: 20 }}>
            {m.link && m.status !== "CANCELLED" && <a className="btn btn-primary" href={m.link} target="_blank" rel="noreferrer"><Video size={16} /> Join meeting</a>}
            {mine && m.status !== "CANCELLED" && (
              <div className="seg">
                {[["ACCEPTED", "Going", Check], ["TENTATIVE", "Maybe", HelpCircle], ["DECLINED", "Can’t go", XCircle]].map(([k, l, I]: any) => (
                  <button key={k} className={mine.response === k ? "on" : ""} onClick={() => rsvp(k)}><I size={13} style={{ verticalAlign: -2 }} /> {l}</button>
                ))}
              </div>
            )}
            {canManage && m.status !== "CANCELLED" && <><button className="btn" onClick={() => setEdit(true)}><Pencil size={15} /> Edit</button><button className="btn" onClick={() => setCancelling(true)}><XCircle size={15} /> Cancel meeting</button></>}
          </div>

          <dl className="kv" style={{ marginBottom: 20 }}>
            <dt>Organiser</dt><dd className="user-cell"><Avatar name={m.organizer.name} small />{m.organizer.name}</dd>
            {m.link && <><dt>Link</dt><dd><a href={m.link} target="_blank" rel="noreferrer" style={{ color: "var(--primary)", overflowWrap: "anywhere" }}>{m.link}</a></dd></>}
            {m.location && <><dt><MapPin size={13} style={{ verticalAlign: -2 }} /> Location</dt><dd>{m.location}</dd></>}
          </dl>

          <h4 style={{ marginBottom: 8 }}>Agenda</h4>
          <div style={{ marginBottom: 22 }}>{m.agenda ? <RichText html={m.agenda} /> : <p className="hint">No agenda added.</p>}</div>

          <h4 style={{ marginBottom: 8 }}>Attendees ({m.attendees.length + 1})</h4>
          <p className="hint" style={{ marginBottom: 8 }}>{counts.ACCEPTED ?? 0} going · {counts.TENTATIVE ?? 0} maybe · {counts.DECLINED ?? 0} declined · {counts.INVITED ?? 0} awaiting</p>
          <div className="subtask" style={{ cursor: "default" }}><Avatar name={m.organizer.name} small /><span style={{ flex: 1 }}>{m.organizer.name} <span className="hint">· organiser</span></span></div>
          {m.attendees.map((a: any) => {
            const [cls, lbl] = RSVP_TONE[a.response];
            return <div key={a.id} className="subtask" style={{ cursor: "default" }}><Avatar name={a.user.name} small /><span style={{ flex: 1 }}>{a.user.name} <span className="hint">· {a.user.designation || ROLE_LABEL[a.user.role]}</span></span><span className={`badge ${cls}`}>{lbl}</span></div>;
          })}
        </div>
      </div>
      {edit && <MeetingFormModal meeting={m} onClose={() => setEdit(false)} onSaved={async () => { setEdit(false); await load(); onChanged(); }} />}
      {cancelling && (
        <Modal title="Cancel this meeting?" onClose={() => setCancelling(false)} footer={<><button className="btn" onClick={() => setCancelling(false)}>Keep it</button><button className="btn btn-danger" onClick={cancel}>Cancel meeting</button></>}>
          <p className="hint" style={{ marginBottom: 12 }}>Everyone invited will be notified.</p>
          <Field label="Reason" hint="Optional"><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </Modal>
      )}
    </div>
  );
}
