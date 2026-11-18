"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Phone, Mail, MessageSquare, Check, Search, X, ExternalLink } from "lucide-react";
import { api } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";
import { FOLLOW_UP_TYPES, STAGE, TEMPS, StageBadge, TempBadge, pretty } from "@/lib/client/leads";
import { Empty, Loading, useToast } from "./ui";
import { CompleteFollowUp, usePeople } from "./lead-parts";

type When = "overdue" | "today" | "upcoming" | "" | "done";
/** One day after the due time (or after now, if it is already overdue). */
const tomorrowFrom = (dueAt: string) => new Date(Math.max(Date.now(), new Date(dueAt).getTime()) + 86_400_000).toISOString();
const istDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/**
 * Lead follow-ups as a work queue (calls, emails, WhatsApp, meetings to do), grouped by day.
 * Mine by default; managers can switch to the whole team.
 */
export function FollowUpList({ teamToggle, onChanged }: { teamToggle?: boolean; onChanged?: () => void }) {
  const toast = useToast();
  const people = usePeople();
  const [when, setWhen] = useState<When>("");
  const [team, setTeam] = useState(false);
  const [rows, setRows] = useState<any[] | null>(null);
  const [f, setF] = useState({ q: "", type: "", temperature: "", stage: "" });
  const [completing, setCompleting] = useState<any>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => api(`/api/leads/follow-ups?when=${when}${team ? "&scope=team" : ""}`).then((r) => { setRows(r.followUps); setNow(Date.now()); }), [when, team]);
  useEffect(() => { setRows(null); load(); }, [load]);
  const changed = () => { load(); onChanged?.(); };

  const shown = useMemo(() => (rows ?? []).filter((x) => {
    const q = f.q.trim().toLowerCase();
    if (q && !`${x.lead.name} ${x.lead.company ?? ""} ${x.note ?? ""} ${x.lead.phone ?? ""} ${x.lead.email ?? ""}`.toLowerCase().includes(q)) return false;
    if (f.type && x.type !== f.type) return false;
    if (f.temperature && x.lead.temperature !== f.temperature) return false;
    if (f.stage && x.lead.stage !== f.stage) return false;
    return true;
  }), [rows, f]);

  /** Group by IST day: "Overdue" first, then each day. */
  const groups = useMemo(() => {
    const today = istDay(new Date(now).toISOString());
    const g = new Map<string, any[]>();
    shown.forEach((x) => {
      const d = istDay(x.dueAt);
      const k = when === "done" ? d : x.status === "PENDING" && d < today ? "Overdue" : d === today ? "Today" : d;
      g.set(k, [...(g.get(k) ?? []), x]);
    });
    return [...g.entries()];
  }, [shown, when, now]);

  async function snooze(x: any) {
    try { await api(`/api/leads/follow-ups/${x.id}`, { method: "PATCH", body: { action: "reschedule", dueAt: tomorrowFrom(x.dueAt) } }); toast("Moved to tomorrow"); changed(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
  }

  const stages = [...new Set((rows ?? []).map((x) => x.lead.stage))];
  const dirty = f.q || f.type || f.temperature || f.stage;
  const label = (k: string) => (k === "Overdue" || k === "Today" ? k : new Date(k + "T00:00:00+05:30").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }));

  return (
    <>
      <div className="toolbar">
        <div className="seg">{([["", "All open"], ["overdue", "Overdue"], ["today", "Today"], ["upcoming", "Upcoming"], ["done", "Done"]] as [When, string][]).map(([k, l]) => <button key={k} className={when === k ? "on" : ""} onClick={() => setWhen(k)}>{l}</button>)}</div>
        <div className="input-wrap" style={{ minWidth: 220 }}><Search size={15} style={{ top: 12 }} /><input className="input" placeholder="Search lead, company, note…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
        <select className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">Any type</option>{FOLLOW_UP_TYPES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}</select>
        <select className="select" value={f.temperature} onChange={(e) => setF({ ...f, temperature: e.target.value })}><option value="">Any temperature</option>{TEMPS.map((t) => <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>)}</select>
        {stages.length > 1 && <select className="select" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}><option value="">Any stage</option>{stages.map((s) => <option key={s} value={s}>{STAGE[s]?.label ?? s}</option>)}</select>}
        {teamToggle && <label className="chip" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={team} onChange={(e) => setTeam(e.target.checked)} /> Whole team</label>}
        {dirty && <button className="btn btn-ghost btn-sm" onClick={() => setF({ q: "", type: "", temperature: "", stage: "" })}><X size={14} /> Clear</button>}
        {rows && <span className="hint" style={{ marginLeft: "auto" }}>{shown.length} follow-up{shown.length === 1 ? "" : "s"}</span>}
      </div>

      {!rows ? <div className="card"><Loading /></div> : shown.length === 0 ? (
        <div className="card"><Empty title={dirty ? "No follow-ups match these filters" : when === "overdue" ? "No overdue follow-ups — nice." : "No follow-ups here"}>{!dirty && when !== "done" && <>Plan one from a lead’s page: <Link href="/leads" style={{ color: "var(--primary)" }}>Leads</Link></>}</Empty></div>
      ) : groups.map(([day, list]) => (
        <section key={day} style={{ marginBottom: 16 }}>
          <h4 className="day-head" style={day === "Overdue" ? { color: "var(--danger)" } : undefined}>{label(day)} <span className="hint">· {list.length}</span></h4>
          <div className="card">
            {list.map((x) => {
              const late = x.status === "PENDING" && new Date(x.dueAt).getTime() < now;
              const wa = x.lead.phone?.replace(/\D/g, "");
              return (
                <div key={x.id} className="list-row" style={{ padding: "12px 16px", cursor: "default", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 130 }}>
                    <b style={{ color: late ? "var(--danger)" : undefined }}>{fmtDateTime(x.dueAt).split(", ").pop()}</b>
                    <div className="hint">{pretty(x.type)}{team ? ` · ${x.assignee.name}` : ""}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <Link href={`/leads/${x.lead.id}`} style={{ fontWeight: 600 }}>{x.lead.name}{x.lead.company ? <span className="hint"> · {x.lead.company}</span> : null} <ExternalLink size={11} /></Link>
                    <div className="hint">{x.status === "DONE" ? <>✓ {x.outcome ?? "Done"}</> : x.status === "CANCELLED" ? "Cancelled" : x.note ?? "—"}</div>
                  </div>
                  <StageBadge stage={x.lead.stage} /> <TempBadge temperature={x.lead.temperature} />
                  {x.lead.phone && <a className="btn btn-sm" title={`Call ${x.lead.phone}`} href={`tel:${x.lead.phone}`}><Phone size={14} /></a>}
                  {wa && <a className="btn btn-sm" title="WhatsApp" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"><MessageSquare size={14} /></a>}
                  {x.lead.email && <a className="btn btn-sm" title={`Email ${x.lead.email}`} href={`mailto:${x.lead.email}`}><Mail size={14} /></a>}
                  {x.status === "PENDING" && <button className="btn btn-sm" title="Snooze to tomorrow" onClick={() => snooze(x)}>+1d</button>}
                  {x.status === "PENDING" && <button className="btn btn-sm btn-primary" onClick={() => setCompleting(x)}><Check size={14} /> Done</button>}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {completing && <CompleteFollowUp f={completing} people={people} closed={["WON", "LOST"].includes(completing.lead.stage)} onClose={() => setCompleting(null)} onDone={() => { setCompleting(null); changed(); }} />}
    </>
  );
}
