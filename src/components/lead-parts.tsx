"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { isoToIst, istToIso } from "@/lib/client/format";
import { FOLLOW_UP_TYPES, LEAD_STAGES, SOURCES, TEMPS, pretty } from "@/lib/client/leads";
import { Field, Modal, Spinner, useToast } from "./ui";
import { RichTextEditor } from "./rich-text";
import { AlarmClock, Building2, FileText, Target, TrendingUp, User } from "lucide-react";

export type FU = { on: boolean; type: string; date: string; time: string; assigneeId: string; note: string };

const inHour = () => {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return isoToIst(d.toISOString());
};
export const blankFU = (on = false): FU => { const t = inHour(); return { on, type: "CALL", date: t.date, time: t.time, assigneeId: "", note: "" }; };
export const fuBody = (f: FU) => ({ type: f.type, dueAt: istToIso(f.date, f.time), ...(f.note && { note: f.note }), ...(f.assigneeId && { assigneeId: Number(f.assigneeId) }) });

/** Everyone active (me first) for owner / assignee pickers. */
export function usePeople() {
  const { user } = useAuth();
  const [people, setPeople] = useState<{ id: number; name: string; designation?: string; role: string }[]>([]);
  useEffect(() => { api("/api/directory").then((r) => setPeople([{ id: user!.id, name: `${user!.name} (me)`, role: user!.role }, ...r.users])); }, [user]);
  return people;
}

/** Next follow-up: type, when (IST), who, note. */
export function FollowUpFields({ value, onChange, people, ownerLabel = "Lead owner" }: { value: FU; onChange: (v: FU) => void; people: { id: number; name: string }[]; ownerLabel?: string }) {
  const set = (k: Partial<FU>) => onChange({ ...value, ...k });
  return (
    <>
      <div className="row">
        <Field label="Follow-up by"><select className="select" value={value.type} onChange={(e) => set({ type: e.target.value })}>{FOLLOW_UP_TYPES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}</select></Field>
        <Field label="Date (IST)"><input type="date" className="input" value={value.date} onChange={(e) => set({ date: e.target.value })} required /></Field>
        <Field label="Time"><input type="time" className="input" value={value.time} onChange={(e) => set({ time: e.target.value })} required /></Field>
      </div>
      <div className="row">
        <Field label="Assign to" hint="Reminded 5 minutes before"><select className="select" value={value.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })}><option value="">{ownerLabel}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="What to do"><input className="input" value={value.note} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. Share pricing, confirm demo slot" /></Field>
      </div>
    </>
  );
}

/** Create or edit a lead. */
export function LeadFormModal({ lead, onClose, onSaved }: { lead?: any; onClose: () => void; onSaved: (lead: any) => void }) {
  const toast = useToast();
  const people = usePeople();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState({
    name: lead?.name ?? "", company: lead?.company ?? "", designation: lead?.designation ?? "", email: lead?.email ?? "", phone: lead?.phone ?? "", website: lead?.website ?? "",
    source: lead?.source ?? "WEBSITE", stage: lead?.stage ?? "NEW", temperature: lead?.temperature ?? "WARM",
    value: lead?.value != null ? String(Number(lead.value)) : "", currency: lead?.currency ?? "INR", requirement: lead?.requirement ?? "", tags: lead?.tags ?? "", ownerId: lead ? String(lead.ownerId) : "",
  });
  const [fu, setFu] = useState<FU>(blankFU(!lead));
  const set = (k: Partial<typeof f>) => setF((s) => ({ ...s, ...k }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const common = {
        name: f.name, company: f.company, designation: f.designation, email: f.email, phone: f.phone, website: f.website, source: f.source,
        value: f.value === "" ? (lead ? null : undefined) : Number(f.value), currency: f.currency, requirement: f.requirement || (lead ? null : undefined), tags: f.tags,
        ...(f.ownerId && { ownerId: Number(f.ownerId) }),
      };
      const r = lead
        ? await api(`/api/leads/${lead.id}`, { method: "PATCH", body: common })
        : await api("/api/leads", { body: { ...common, stage: f.stage, temperature: f.temperature, ...(fu.on && { firstFollowUp: fuBody(fu) }) } });
      toast(lead ? "Lead updated" : "Lead created");
      onSaved(r.lead);
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); setBusy(false); }
  }

  const sec = (Icon: typeof User, title: string, hint?: string) => <div className="dc-head"><h3><Icon size={15} color="var(--primary)" /> {title}</h3>{hint && <span className="hint">{hint}</span>}</div>;

  return (
    <Modal title={lead ? "Edit lead" : "New lead"} subtitle={lead ? `${lead.name}${lead.company ? ` · ${lead.company}` : ""}` : "Add a prospect to the pipeline"} icon={<Target size={18} />} onClose={onClose} width={760}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="leadform" disabled={busy}>{busy ? <Spinner /> : lead ? "Save changes" : "Create lead"}</button></>}>
      <form id="leadform" onSubmit={submit} className="form-sections">
        {err && <div className="alert alert-error" style={{ marginBottom: 0 }}>{err}</div>}

        <section className="form-section">
          {sec(User, "Contact")}
          <div className="row">
            <Field label="Contact name"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} required autoFocus placeholder="Full name" /></Field>
            <Field label="Designation"><input className="input" value={f.designation} onChange={(e) => set({ designation: e.target.value })} placeholder="CTO, Founder…" /></Field>
          </div>
          <div className="row">
            <Field label="Email"><input type="email" className="input" value={f.email} onChange={(e) => set({ email: e.target.value })} placeholder="name@company.com" /></Field>
            <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+91…" /></Field>
          </div>
        </section>

        <section className="form-section">
          {sec(Building2, "Company")}
          <div className="row">
            <Field label="Company"><input className="input" value={f.company} onChange={(e) => set({ company: e.target.value })} /></Field>
            <Field label="Website"><input className="input" value={f.website} onChange={(e) => set({ website: e.target.value })} placeholder="company.com" /></Field>
          </div>
          <Field label="Source" hint="Where did this lead come from?">
            <div className="seg-pick">{SOURCES.map((x) => <button type="button" key={x} className={f.source === x ? "on" : ""} onClick={() => set({ source: x })}>{pretty(x)}</button>)}</div>
          </Field>
        </section>

        <section className="form-section">
          {sec(TrendingUp, "Deal & pipeline", lead ? "Change stage and temperature on the lead page" : undefined)}
          {!lead && (
            <>
              <Field label="Stage"><select className="select" value={f.stage} onChange={(e) => set({ stage: e.target.value })}>{LEAD_STAGES.filter((x) => x.key !== "LOST").map((x) => <option key={x.key} value={x.key}>{x.label} — {x.hint}</option>)}</select></Field>
              <Field label="Temperature">
                <div className="seg full">{TEMPS.map((t) => <button type="button" key={t.key} className={f.temperature === t.key ? "on" : ""} onClick={() => set({ temperature: t.key })}>{t.emoji} {t.label}</button>)}</div>
              </Field>
            </>
          )}
          <div className="row">
            <Field label="Expected deal value"><input type="number" min={0} className="input" value={f.value} onChange={(e) => set({ value: e.target.value })} placeholder="0" /></Field>
            <Field label="Currency"><select className="select" value={f.currency} onChange={(e) => set({ currency: e.target.value })}>{["INR", "USD", "EUR", "GBP", "AED", "SGD"].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Owner"><select className="select" value={f.ownerId} onChange={(e) => set({ ownerId: e.target.value })}><option value="">{lead ? "Keep current owner" : "Me"}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          </div>
          <Field label="Tags" hint="Comma separated, e.g. enterprise, saas"><input className="input" value={f.tags} onChange={(e) => set({ tags: e.target.value })} /></Field>
        </section>

        <section className="form-section">
          {sec(FileText, "Requirement", "What do they need?")}
          <div className="field"><RichTextEditor value={f.requirement} onChange={(html) => set({ requirement: html })} placeholder="Scope, pain points, budget, timeline, decision makers…" minHeight={120} /></div>
        </section>

        {!lead && (
          <section className="form-section">
            <div className="dc-head">
              <h3><AlarmClock size={15} color="var(--primary)" /> First follow-up</h3>
              <label className="hint" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={fu.on} onChange={(e) => setFu({ ...fu, on: e.target.checked })} /> Schedule now</label>
            </div>
            {fu.on ? <FollowUpFields value={fu} onChange={setFu} people={people} /> : <p className="hint" style={{ marginBottom: 12 }}>No follow-up yet. You can plan one later on the lead page.</p>}
          </section>
        )}
      </form>
    </Modal>
  );
}

/** Ask for the lost reason (and an optional note) before moving a lead to a stage. */
export function StageChangeModal({ leadId, stage, onClose, onDone }: { leadId: number; stage: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const lost = stage === "LOST";
  const label = LEAD_STAGES.find((s) => s.key === stage)?.label ?? stage;
  async function go() {
    setBusy(true);
    try { await api(`/api/leads/${leadId}/stage`, { body: { stage, ...(lost ? { lostReason: note } : note && { note }) } }); toast(`Moved to ${label}`); onDone(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", true); setBusy(false); }
  }
  return (
    <Modal title={`Move to “${label}”`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className={`btn ${lost ? "btn-danger" : "btn-primary"}`} disabled={busy || (lost && !note.trim())} onClick={go}>{busy ? <Spinner /> : "Move"}</button></>}>
      {(stage === "WON" || lost) && <p className="hint" style={{ marginBottom: 12 }}>Open follow-ups on this lead will be closed.</p>}
      <Field label={lost ? "Why was it lost?" : "Note"} hint={lost ? "Required — e.g. budget, chose a competitor, no response" : "Optional — added to the lead journey"}>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
      </Field>
    </Modal>
  );
}

/** Mark a follow-up done with its outcome, optionally planning the next one in the same step. */
export function CompleteFollowUp({ f, people, closed, onClose, onDone }: { f: any; people: any[]; closed: boolean; onClose: () => void; onDone: () => void }) {
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
