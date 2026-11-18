"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Target, Flame, AlarmClock, Trophy, Wallet, KanbanSquare, List, PhoneCall } from "lucide-react";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { fmtDate, fmtDateTime, ROLE_RANK } from "@/lib/client/format";
import { LEAD_STAGES, OPEN_STAGE_KEYS, SOURCES, STAGE, TEMPS, StageBadge, TempBadge, fmtMoney, pretty } from "@/lib/client/leads";
import { Avatar, Empty, Loading, PageHeader, useToast } from "@/components/ui";
import { LeadFormModal, StageChangeModal } from "@/components/lead-parts";
import { FollowUpList } from "@/components/follow-up-list";

type View = "board" | "list" | "followups";

export default function LeadsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const [view, setView] = useState<View>("board");
  const [data, setData] = useState<any>(null);
  const [f, setF] = useState({ q: "", temperature: "", source: "", owner: "", status: "open", followUp: "" });
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<{ id: number; stage: string } | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const isManager = ROLE_RANK[user!.role] >= ROLE_RANK.MANAGER;

  const load = useCallback(() => {
    const q = new URLSearchParams();
    if (f.q) q.set("q", f.q);
    if (f.temperature) q.set("temperature", f.temperature);
    if (f.source) q.set("source", f.source);
    if (f.owner) q.set("ownerId", f.owner);
    if (f.followUp) q.set("followUp", f.followUp);
    q.set("status", view === "board" && f.status === "open" ? "all" : f.status);
    return api(`/api/leads?${q}`).then(setData).catch((e) => toast(e.message, true));
  }, [f, view, toast]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  async function moveTo(id: number, stage: string) {
    const lead = data.leads.find((l: any) => l.id === id);
    if (!lead || lead.stage === stage) return;
    if (stage === "LOST" || stage === "WON") return setMoving({ id, stage });
    try { await api(`/api/leads/${id}/stage`, { body: { stage } }); toast(`${lead.name} → ${STAGE[stage].label}`); load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
  }

  const s = data?.summary;
  const kpis = s ? [
    { icon: Target, label: "Open leads", value: s.open, tone: "b-purple", onClick: () => setF({ ...f, status: "open", temperature: "", followUp: "" }) },
    { icon: Flame, label: "Hot leads", value: s.hot, tone: "b-red", onClick: () => setF({ ...f, temperature: "HOT" }) },
    { icon: AlarmClock, label: `Follow-ups today${s.followUpsOverdue ? ` · ${s.followUpsOverdue} overdue` : ""}`, value: s.followUpsToday, tone: s.followUpsOverdue ? "b-red" : "b-amber", onClick: () => setView("followups") },
    { icon: Trophy, label: `Won this month${s.winRate !== null ? ` · ${s.winRate}% win rate` : ""}`, value: s.wonThisMonth, tone: "b-green", onClick: () => setF({ ...f, status: "won" }) },
    { icon: Wallet, label: "Open pipeline value", value: fmtMoney(s.pipelineValue), tone: "b-blue" },
  ] : [];

  return (
    <>
      <PageHeader title="Leads" subtitle="Your sales pipeline — every lead from first contact to won, with follow-ups and meetings."
        actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New lead</button>} />

      {s && (
        <div className="kpis" style={{ marginBottom: 16 }}>
          {kpis.map((k) => (
            <div className="card kpi" key={k.label} style={{ cursor: k.onClick ? "pointer" : undefined }} onClick={k.onClick}>
              <span className={`icon ${k.tone}`}><k.icon size={18} /></span>
              <div><span className="kpi-num">{k.value}</span><span className="kpi-cap">{k.label}</span></div>
            </div>
          ))}
        </div>
      )}

      <div className="tabs">
        <button className={`tab${view === "board" ? " active" : ""}`} onClick={() => setView("board")}><KanbanSquare size={14} style={{ verticalAlign: -2 }} /> Pipeline</button>
        <button className={`tab${view === "list" ? " active" : ""}`} onClick={() => setView("list")}><List size={14} style={{ verticalAlign: -2 }} /> List</button>
        <button className={`tab${view === "followups" ? " active" : ""}`} onClick={() => setView("followups")}><PhoneCall size={14} style={{ verticalAlign: -2 }} /> Follow-ups</button>
      </div>

      {view !== "followups" && (
        <div className="toolbar">
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={15} style={{ position: "absolute", left: 10, top: 11, color: "var(--muted)" }} />
            <input className="input" style={{ paddingLeft: 32, width: "100%" }} placeholder="Search name, company, email, phone, tag…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          </div>
          <select className="select" value={f.temperature} onChange={(e) => setF({ ...f, temperature: e.target.value })}><option value="">Any temperature</option>{TEMPS.map((t) => <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>)}</select>
          <select className="select" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="">Any source</option>{SOURCES.map((x) => <option key={x} value={x}>{pretty(x)}</option>)}</select>
          <select className="select" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}><option value="">{isManager ? "All owners" : "All my leads"}</option><option value="me">Owned by me</option></select>
          <select className="select" value={f.followUp} onChange={(e) => setF({ ...f, followUp: e.target.value })}><option value="">Any follow-up</option><option value="overdue">Follow-up overdue</option><option value="today">Follow-up today</option><option value="none">No follow-up planned</option></select>
          {view === "list" && <select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option><option value="all">All</option></select>}
        </div>
      )}

      {view === "followups" ? <FollowUpList teamToggle={isManager} onChanged={load} /> : !data ? <Loading /> : view === "board" ? (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", alignItems: "flex-start", paddingBottom: 8 }}>
          {LEAD_STAGES.map((st) => {
            const items = data.leads.filter((l: any) => l.stage === st.key);
            const value = items.reduce((n: number, l: any) => n + Number(l.value ?? 0), 0);
            return (
              <div key={st.key} className="column" style={{ minWidth: 250, maxWidth: 250, outline: dragId ? "2px dashed #c7d2fe" : undefined }}
                onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragId) moveTo(dragId, st.key); setDragId(null); }}>
                <div className="column-head" title={st.hint}><span>{st.label}</span><span className="count">{items.length}</span></div>
                {value > 0 && <div className="hint" style={{ margin: "-8px 4px 10px" }}>{fmtMoney(value)}</div>}
                {items.map((l: any) => <LeadCard key={l.id} l={l} onOpen={() => router.push(`/leads/${l.id}`)} onDrag={setDragId} />)}
                {items.length === 0 && <div className="hint" style={{ textAlign: "center", padding: 12 }}>Drop a lead here</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          {data.leads.length === 0 ? <Empty title="No leads match">Create one with “New lead”.</Empty> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Lead</th><th>Stage</th><th>Temp.</th><th>Value</th><th>Owner</th><th>Next follow-up</th><th>Last activity</th></tr></thead>
              <tbody>
                {data.leads.map((l: any) => {
                  const overdue = l.nextFollowUpAt && new Date(l.nextFollowUpAt) < new Date();
                  return (
                    <tr key={l.id} className="click" onClick={() => router.push(`/leads/${l.id}`)}>
                      <td><div style={{ fontWeight: 600 }}>{l.name}</div><div className="sub">{[l.company, pretty(l.source)].filter(Boolean).join(" · ")}</div></td>
                      <td><StageBadge stage={l.stage} /></td>
                      <td><TempBadge temperature={l.temperature} /></td>
                      <td>{fmtMoney(l.value, l.currency)}</td>
                      <td><div className="user-cell"><Avatar name={l.owner.name} small />{l.owner.name}</div></td>
                      <td style={{ color: overdue ? "var(--danger)" : undefined, fontWeight: overdue ? 600 : undefined }}>{l.nextFollowUpAt ? fmtDateTime(l.nextFollowUpAt) : OPEN_STAGE_KEYS.includes(l.stage) ? <span className="badge b-amber">None planned</span> : "—"}</td>
                      <td>{fmtDate(l.lastActivityAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </div>
      )}

      {creating && <LeadFormModal onClose={() => setCreating(false)} onSaved={(l) => { setCreating(false); router.push(`/leads/${l.id}`); }} />}
      {moving && <StageChangeModal leadId={moving.id} stage={moving.stage} onClose={() => setMoving(null)} onDone={() => { setMoving(null); load(); }} />}
    </>
  );
}

function LeadCard({ l, onOpen, onDrag }: { l: any; onOpen: () => void; onDrag: (id: number | null) => void }) {
  const overdue = l.nextFollowUpAt && new Date(l.nextFollowUpAt) < new Date();
  return (
    <div className="task-card" draggable onDragStart={() => onDrag(l.id)} onDragEnd={() => onDrag(null)} onClick={onOpen}>
      <div className="task-title">{l.name}</div>
      {l.company && <div className="hint" style={{ marginBottom: 6 }}>{l.company}</div>}
      <div className="task-meta">
        <TempBadge temperature={l.temperature} />
        {l.value != null && <span>{fmtMoney(l.value, l.currency)}</span>}
        <span className="push"><Avatar name={l.owner.name} small /></span>
      </div>
      {l.nextFollowUpAt && <div className="hint" style={{ marginTop: 6, color: overdue ? "var(--danger)" : undefined }}><AlarmClock size={12} style={{ verticalAlign: -2 }} /> {fmtDateTime(l.nextFollowUpAt)}</div>}
    </div>
  );
}
