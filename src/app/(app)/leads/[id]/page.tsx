"use client";

import { use, useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Phone, Mail, Globe, Pencil, Trash2, CalendarPlus, Presentation, Check, X, Clock, MessageSquare, PhoneCall, MessageCircle, StickyNote, ArrowRight, CalendarClock, Trophy, XCircle, Flame, UserCog, Plus } from "lucide-react";
import { api } from "@/lib/client/api";
import { fmtDate, fmtDateTime, isoToIst } from "@/lib/client/format";
import { LEAD_STAGES, OPEN_STAGE_KEYS, STAGE, TEMPS, TEMP, StageBadge, TempBadge, fmtMoney, pretty } from "@/lib/client/leads";
import { Avatar, Field, Loading, Modal, PageHeader, Spinner, useToast } from "@/components/ui";
import { FollowUpFields, LeadFormModal, StageChangeModal, blankFU, fuBody, usePeople, type FU } from "@/components/lead-parts";
import { MeetingDrawer, MeetingFormModal, timeRange } from "@/components/meeting-parts";

const ACT_ICON: Record<string, typeof Phone> = {
  CREATED: Plus, UPDATED: Pencil, STAGE_CHANGED: ArrowRight, TEMPERATURE_CHANGED: Flame, OWNER_CHANGED: UserCog, NOTE: StickyNote, CALL: PhoneCall, EMAIL: Mail, WHATSAPP: MessageCircle,
  MEETING_SCHEDULED: CalendarClock, MEETING_CANCELLED: XCircle, FOLLOW_UP_SCHEDULED: Clock, FOLLOW_UP_DONE: Check, FOLLOW_UP_CANCELLED: X,
};

function describe(a: any) {
  const v = (x: string | null) => (x && /^\d{4}-\d\d-\d\dT/.test(x) ? fmtDateTime(x) : x);
  switch (a.type) {
    case "CREATED": return <>created the lead as <b>{STAGE[a.toValue]?.label ?? a.toValue}</b></>;
    case "STAGE_CHANGED": return <>moved <b>{STAGE[a.fromValue]?.label ?? a.fromValue}</b> → <b>{STAGE[a.toValue]?.label ?? a.toValue}</b></>;
    case "TEMPERATURE_CHANGED": return <>marked it <b>{TEMP[a.toValue]?.emoji} {TEMP[a.toValue]?.label}</b> (was {TEMP[a.fromValue]?.label})</>;
    case "OWNER_CHANGED": return <>handed it from {a.fromValue} to <b>{a.toValue}</b></>;
    case "CALL": return <>logged a <b>call</b></>;
    case "EMAIL": return <>logged an <b>email</b></>;
    case "WHATSAPP": return <>logged a <b>WhatsApp</b> message</>;
    case "NOTE": return <>added a <b>note</b></>;
    case "MEETING_SCHEDULED": return <>scheduled a <b>meeting</b></>;
    case "MEETING_CANCELLED": return <>cancelled a <b>meeting</b></>;
    case "FOLLOW_UP_SCHEDULED": return a.fromValue ? <>rescheduled a follow-up to <b>{v(a.toValue)}</b></> : <>planned a follow-up for <b>{v(a.toValue)}</b></>;
    case "FOLLOW_UP_DONE": return <>completed a <b>{pretty(a.toValue ?? "follow-up")}</b> follow-up</>;
    case "FOLLOW_UP_CANCELLED": return <>cancelled a follow-up</>;
    default: return <>updated the lead</>;
  }
}

export default function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const people = usePeople();
  const [d, setD] = useState<any>(null);
  const [edit, setEdit] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<null | { isDemo: boolean }>(null);
  const [openMeeting, setOpenMeeting] = useState<number | null>(null);
  const [addFu, setAddFu] = useState(false);
  const [completing, setCompleting] = useState<any>(null);

  const load = useCallback(() => api(`/api/leads/${id}`).then(setD).catch((e) => { toast(e.message, true); router.push("/leads"); }), [id, toast, router]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <Loading />;
  const { lead: l, canManage } = d;
  const closed = l.stage === "WON" || l.stage === "LOST";
  const curIdx = OPEN_STAGE_KEYS.indexOf(l.stage);
  const pending = l.followUps.filter((f: any) => f.status === "PENDING");
  const history = l.followUps.filter((f: any) => f.status !== "PENDING");
  const upcoming = l.meetings.filter((m: any) => m.status === "SCHEDULED" && new Date(m.endsAt) > new Date());
  const pastMeetings = l.meetings.filter((m: any) => !upcoming.includes(m));

  async function setTemp(t: string) {
    if (t === l.temperature) return;
    try { await api(`/api/leads/${l.id}/temperature`, { body: { temperature: t } }); toast(`Marked ${TEMP[t].label}`); load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
  }
  async function quickStage(stage: string) {
    if (stage === l.stage) return;
    if (stage === "LOST" || stage === "WON") return setMoving(stage);
    try { await api(`/api/leads/${l.id}/stage`, { body: { stage } }); toast(`Moved to ${STAGE[stage].label}`); load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
  }
  async function fuAction(fid: number, body: object, msg: string) {
    try { await api(`/api/leads/follow-ups/${fid}`, { method: "PATCH", body }); toast(msg); load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
  }
  async function remove() {
    if (!confirm(`Delete lead “${l.name}” and its whole history? Meetings are kept.`)) return;
    await api(`/api/leads/${l.id}`, { method: "DELETE" }); toast("Lead deleted"); router.push("/leads");
  }

  return (
    <>
      <PageHeader crumbs={[{ label: "Leads", href: "/leads" }, { label: l.name }]} title={l.name} subtitle={[l.designation, l.company].filter(Boolean).join(" · ") || undefined}
        actions={<>
          {!closed && <button className="btn" onClick={() => setMeeting({ isDemo: false })}><CalendarPlus size={16} /> Meeting</button>}
          {!closed && <button className="btn" onClick={() => setMeeting({ isDemo: true })}><Presentation size={16} /> Schedule demo</button>}
          {canManage && <button className="btn" onClick={() => setEdit(true)}><Pencil size={16} /> Edit</button>}
          {d.canDelete && <button className="btn btn-ghost" title="Delete lead" onClick={remove}><Trash2 size={16} /></button>}
        </>} />

      {/* Journey / stage stepper */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
          <div className="actions"><StageBadge stage={l.stage} /><TempBadge temperature={l.temperature} />{l.value != null && <span className="badge b-gray">{fmtMoney(l.value, l.currency)}</span>}</div>
          <div className="actions">
            <span className="hint">Temperature</span>
            <div className="seg">{TEMPS.map((t) => <button key={t.key} className={l.temperature === t.key ? "on" : ""} onClick={() => setTemp(t.key)}>{t.emoji} {t.label}</button>)}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, overflowX: "auto" }}>
          {LEAD_STAGES.filter((s) => s.key !== "WON" && s.key !== "LOST").map((s, i) => {
            const done = closed ? l.stage === "WON" : i < curIdx;
            const cur = s.key === l.stage;
            return (
              <button key={s.key} title={`${s.hint} — click to move here`} onClick={() => quickStage(s.key)}
                style={{ flex: 1, minWidth: 96, border: "none", cursor: "pointer", padding: "9px 6px", fontSize: 12, fontWeight: cur ? 700 : 500, borderRadius: 6,
                  background: cur ? "var(--primary)" : done ? "var(--primary-soft)" : "#eef0f6", color: cur ? "#fff" : done ? "var(--primary)" : "#475569" }}>
                {done && !cur ? "✓ " : ""}{s.label}
              </button>
            );
          })}
          <button onClick={() => quickStage("WON")} style={{ minWidth: 80, border: "none", cursor: "pointer", borderRadius: 6, fontSize: 12, fontWeight: 700, background: l.stage === "WON" ? "var(--success)" : "var(--success-soft)", color: l.stage === "WON" ? "#fff" : "var(--success)" }}><Trophy size={12} style={{ verticalAlign: -2 }} /> Won</button>
          <button onClick={() => quickStage("LOST")} style={{ minWidth: 80, border: "none", cursor: "pointer", borderRadius: 6, fontSize: 12, fontWeight: 700, background: l.stage === "LOST" ? "var(--danger)" : "var(--danger-soft)", color: l.stage === "LOST" ? "#fff" : "var(--danger)" }}><XCircle size={12} style={{ verticalAlign: -2 }} /> Lost</button>
        </div>
        {l.stage === "LOST" && l.lostReason && <p className="hint" style={{ marginTop: 10 }}>Lost because: {l.lostReason}</p>}
        {!closed && pending.length === 0 && <div className="alert alert-info" style={{ marginTop: 12, marginBottom: 0 }}>No follow-up planned — <button className="btn btn-ghost btn-sm" onClick={() => setAddFu(true)}>plan the next one</button> so this lead doesn’t go cold.</div>}
      </div>

      <div className="grid grid-main" style={{ alignItems: "start" }}>
        <div>
          <LogActivity leadId={l.id} closed={closed} people={people} onDone={load} />
          <div className="card card-pad">
            <h3 style={{ marginBottom: 14 }}>Lead journey</h3>
            <ul className="timeline">
              {l.activities.map((a: any) => {
                const I = ACT_ICON[a.type] ?? StickyNote;
                return (
                  <li key={a.id}>
                    <div><I size={13} style={{ verticalAlign: -2, marginRight: 4, color: "var(--muted)" }} /><b>{a.actor.name}</b> {describe(a)}</div>
                    {a.note && <div style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>{a.note}</div>}
                    <div className="when">{fmtDateTime(a.at)}</div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div>
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Contact</h3>
            <dl className="kv" style={{ gridTemplateColumns: "100px 1fr" }}>
              {l.email && <><dt>Email</dt><dd><a href={`mailto:${l.email}`} style={{ color: "var(--primary)" }}>{l.email}</a></dd></>}
              {l.phone && <><dt>Phone</dt><dd><a href={`tel:${l.phone}`} style={{ color: "var(--primary)" }}>{l.phone}</a>{" "}<a href={`https://wa.me/${l.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="hint">WhatsApp</a></dd></>}
              {l.website && <><dt>Website</dt><dd><a href={/^https?:/.test(l.website) ? l.website : `https://${l.website}`} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}><Globe size={12} /> {l.website}</a></dd></>}
              <dt>Source</dt><dd>{pretty(l.source)}</dd>
              <dt>Owner</dt><dd className="user-cell"><Avatar name={l.owner.name} small />{l.owner.name}</dd>
              <dt>Created</dt><dd>{fmtDate(l.createdAt)} by {l.creator.name}</dd>
              {l.tags && <><dt>Tags</dt><dd>{l.tags.split(",").map((t: string) => <span key={t} className="badge b-gray" style={{ marginRight: 4 }}>{t.trim()}</span>)}</dd></>}
            </dl>
            {l.requirement && <><h4 style={{ margin: "12px 0 6px" }}>Requirement</h4><p style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{l.requirement}</p></>}
            <div className="actions" style={{ marginTop: 12 }}>
              {l.phone && <a className="btn btn-sm" href={`tel:${l.phone}`}><Phone size={14} /> Call</a>}
              {l.email && <a className="btn btn-sm" href={`mailto:${l.email}`}><Mail size={14} /> Email</a>}
              {l.phone && <a className="btn btn-sm" href={`https://wa.me/${l.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><MessageSquare size={14} /> WhatsApp</a>}
            </div>
          </div>

          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><h3>Follow-ups</h3>{!closed && <button className="btn btn-sm" onClick={() => setAddFu(true)}><Plus size={14} /> Plan</button>}</div>
            {pending.length === 0 && <p className="hint">Nothing planned.</p>}
            {pending.map((f: any) => {
              const late = new Date(f.dueAt) < new Date();
              return (
                <div key={f.id} className="subtask" style={{ cursor: "default", flexWrap: "wrap", borderColor: late ? "#f4cccc" : undefined }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <b style={{ color: late ? "var(--danger)" : undefined }}>{pretty(f.type)} · {fmtDateTime(f.dueAt)}</b>
                    <div className="hint">{f.assignee.name}{f.note ? ` — ${f.note}` : ""}</div>
                  </div>
                  <button className="btn btn-sm btn-primary" onClick={() => setCompleting(f)}><Check size={13} /> Done</button>
                  <button className="btn btn-sm" title="Snooze 1 day" onClick={() => fuAction(f.id, { action: "reschedule", dueAt: new Date(new Date(f.dueAt).getTime() + 86_400_000).toISOString() }, "Moved to tomorrow")}>+1d</button>
                  <button className="btn btn-ghost btn-sm" title="Cancel" onClick={() => fuAction(f.id, { action: "cancel" }, "Follow-up cancelled")}><X size={13} /></button>
                </div>
              );
            })}
            {history.length > 0 && (
              <details style={{ marginTop: 8 }}><summary className="hint" style={{ cursor: "pointer" }}>History ({history.length})</summary>
                {history.map((f: any) => <div key={f.id} className="hint" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>{f.status === "DONE" ? "✓" : "✕"} {pretty(f.type)} · {fmtDateTime(f.dueAt)} · {f.assignee.name}{f.outcome ? ` — ${f.outcome}` : ""}</div>)}
              </details>
            )}
          </div>

          <div className="card card-pad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><h3>Meetings</h3>{!closed && <button className="btn btn-sm" onClick={() => setMeeting({ isDemo: false })}><Plus size={14} /> Schedule</button>}</div>
            {l.meetings.length === 0 && <p className="hint">No meetings yet.</p>}
            {[...upcoming].reverse().concat(pastMeetings).map((m: any) => (
              <div key={m.id} className="subtask" onClick={() => setOpenMeeting(m.id)} style={{ opacity: m.status === "CANCELLED" || !upcoming.includes(m) ? 0.65 : 1 }}>
                <CalendarClock size={16} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, textDecoration: m.status === "CANCELLED" ? "line-through" : undefined }}>{m.title}</div>
                  <div className="hint">{fmtDate(m.startsAt)} · {timeRange(m)} · {m.attendees.length + 1} team{m.guests.length ? ` + ${m.guests.length} guest${m.guests.length > 1 ? "s" : ""}` : ""}</div>
                </div>
                {upcoming.includes(m) && <span className="badge b-green">Upcoming</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {edit && <LeadFormModal lead={l} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); load(); }} />}
      {moving && <StageChangeModal leadId={l.id} stage={moving} onClose={() => setMoving(null)} onDone={() => { setMoving(null); load(); }} />}
      {meeting && <MeetingFormModal lead={l} defaults={{ title: `${meeting.isDemo ? "Demo" : "Meeting"} — ${l.company || l.name}`, isDemo: meeting.isDemo }} onClose={() => setMeeting(null)} onSaved={() => { setMeeting(null); load(); }} />}
      {openMeeting && <MeetingDrawer meetingId={openMeeting} onClose={() => setOpenMeeting(null)} onChanged={load} />}
      {addFu && <AddFollowUp leadId={l.id} people={people} onClose={() => setAddFu(false)} onDone={() => { setAddFu(false); load(); }} />}
      {completing && <CompleteFollowUp f={completing} people={people} closed={closed} onClose={() => setCompleting(null)} onDone={() => { setCompleting(null); load(); }} />}
    </>
  );
}

/** Composer: what happened (call / email / WhatsApp / note) + optionally the next follow-up. */
function LogActivity({ leadId, closed, people, onDone }: { leadId: number; closed: boolean; people: any[]; onDone: () => void }) {
  const toast = useToast();
  const [type, setType] = useState("CALL");
  const [note, setNote] = useState("");
  const [fu, setFu] = useState<FU>(blankFU(false));
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/leads/${leadId}/activities`, { body: { type, note, ...(fu.on && !closed && { nextFollowUp: fuBody(fu) }) } });
      toast(fu.on ? "Logged — next follow-up planned" : "Logged");
      setNote(""); setFu(blankFU(false)); onDone();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
    finally { setBusy(false); }
  }
  return (
    <form className="card card-pad" style={{ marginBottom: 16 }} onSubmit={submit}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <h3>Log an update</h3>
        <div className="seg">{[["CALL", "📞 Call"], ["EMAIL", "✉️ Email"], ["WHATSAPP", "💬 WhatsApp"], ["NOTE", "📝 Note"]].map(([k, lbl]) => <button type="button" key={k} className={type === k ? "on" : ""} onClick={() => setType(k)}>{lbl}</button>)}</div>
      </div>
      <textarea className="textarea" required value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === "NOTE" ? "Anything worth remembering…" : "What was discussed? Any objections, next steps?"} />
      {!closed && <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0" }}><input type="checkbox" checked={fu.on} onChange={(e) => setFu({ ...fu, on: e.target.checked })} /> Plan the next follow-up</label>}
      {fu.on && !closed && <FollowUpFields value={fu} onChange={setFu} people={people} />}
      <button className="btn btn-primary" disabled={busy || !note.trim()} style={{ marginTop: 8 }}>{busy ? <Spinner /> : "Save update"}</button>
    </form>
  );
}

function AddFollowUp({ leadId, people, onClose, onDone }: { leadId: number; people: any[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [fu, setFu] = useState<FU>(blankFU(true));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await api(`/api/leads/${leadId}/follow-ups`, { body: fuBody(fu) }); toast("Follow-up planned — a reminder goes out 5 minutes before"); onDone(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", true); setBusy(false); }
  }
  return (
    <Modal title="Plan a follow-up" onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : "Plan follow-up"}</button></>}>
      <FollowUpFields value={fu} onChange={setFu} people={people} />
    </Modal>
  );
}

function CompleteFollowUp({ f, people, closed, onClose, onDone }: { f: any; people: any[]; closed: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [outcome, setOutcome] = useState("");
  const [fu, setFu] = useState<FU>(() => { const b = blankFU(true); const t = isoToIst(new Date(Date.now() + 2 * 86_400_000).toISOString()); return { ...b, date: t.date, time: isoToIst(f.dueAt).time, type: f.type, assigneeId: String(f.assigneeId) }; });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api(`/api/leads/follow-ups/${f.id}`, { method: "PATCH", body: { action: "done", ...(outcome && { outcome }), ...(fu.on && !closed && { nextFollowUp: fuBody(fu) }) } });
      toast(fu.on ? "Done — next follow-up planned" : "Follow-up done"); onDone();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", true); setBusy(false); }
  }
  return (
    <Modal title={`Complete: ${pretty(f.type)} follow-up`} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : "Mark done"}</button></>}>
      <Field label="Outcome" hint="What happened? Goes into the lead journey."><textarea className="textarea" value={outcome} onChange={(e) => setOutcome(e.target.value)} autoFocus /></Field>
      {!closed && <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "6px 0 12px", fontWeight: 600 }}><input type="checkbox" checked={fu.on} onChange={(e) => setFu({ ...fu, on: e.target.checked })} /> Plan the next follow-up</label>}
      {fu.on && !closed && <FollowUpFields value={fu} onChange={setFu} people={people} />}
    </Modal>
  );
}
