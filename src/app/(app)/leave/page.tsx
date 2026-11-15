"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, Check, X as XIcon } from "lucide-react";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { fmtDate, isoDate, ROLE_RANK } from "@/lib/client/format";
import { Avatar, Empty, Field, Loading, Modal, PageHeader, Spinner, useToast } from "@/components/ui";

const STATUS_TONE: Record<string, string> = { PENDING: "b-amber", APPROVED: "b-green", REJECTED: "b-red", CANCELLED: "b-gray" };
const Status = ({ s }: { s: string }) => <span className={`badge ${STATUS_TONE[s]}`}>{s[0] + s.slice(1).toLowerCase()}</span>;
const range = (r: any) => (r.startDate === r.endDate ? fmtDate(r.startDate) : `${fmtDate(r.startDate)} → ${fmtDate(r.endDate)}`);

export default function LeavePage() {
  const { user } = useAuth();
  const toast = useToast();
  const isApprover = ROLE_RANK[user!.role] >= ROLE_RANK.MANAGER;
  const [tab, setTab] = useState<"mine" | "team">("mine");
  const [mine, setMine] = useState<any[] | null>(null);
  const [team, setTeam] = useState<any[] | null>(null);
  const [bal, setBal] = useState<any>(null);
  const [open, setOpen] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new") === "1");
  const [decide, setDecide] = useState<null | { r: any; decision: "APPROVE" | "REJECT" }>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [m, b, t] = await Promise.all([
      api("/api/leaves"),
      api(`/api/users/${user!.id}/leaves`),
      isApprover ? api("/api/leaves?scope=team") : Promise.resolve({ requests: [] }),
    ]);
    setMine(m.requests); setBal(b); setTeam(t.requests);
  }, [user, isApprover]);
  useEffect(() => { load(); }, [load]);

  async function cancel(id: number) {
    try { await api(`/api/leaves/${id}/cancel`, { method: "POST" }); toast("Request cancelled"); load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
  }
  async function submitDecision() {
    if (!decide) return;
    setBusy(true);
    try {
      await api(`/api/leaves/${decide.r.id}/decision`, { body: { decision: decide.decision, ...(note && { note }) } });
      toast(decide.decision === "APPROVE" ? "Leave approved" : "Leave rejected");
      setDecide(null); setNote(""); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
    finally { setBusy(false); }
  }

  if (!mine || !bal || !team) return <Loading />;
  const pendingTeam = team.filter((r) => r.status === "PENDING");

  return (
    <>
      <PageHeader title="Leave" subtitle="Request time off and track your paid leave balance." actions={<button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Request leave</button>} />

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <div className="card stat"><div><div className="num">{bal.totalPaidLeaves}</div><div className="cap">Paid leave {bal.year}</div></div></div>
        <div className="card stat"><div><div className="num">{bal.used}</div><div className="cap">Taken</div></div></div>
        <div className="card stat"><div><div className="num">{bal.pending}</div><div className="cap">Pending approval</div></div></div>
        <div className="card stat"><div><div className="num" style={{ color: "var(--success)" }}>{bal.remaining}</div><div className="cap">Remaining</div></div></div>
      </div>

      {isApprover && (
        <div className="tabs">
          <button className={`tab${tab === "mine" ? " active" : ""}`} onClick={() => setTab("mine")}>My requests</button>
          <button className={`tab${tab === "team" ? " active" : ""}`} onClick={() => setTab("team")}>Team requests {pendingTeam.length > 0 && <span className="badge b-red">{pendingTeam.length}</span>}</button>
        </div>
      )}

      {tab === "mine" && (
        <div className="card">
          {mine.length === 0 ? <Empty title="No leave requests yet" /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Dates</th><th>Type</th><th>Days</th><th>Reason</th><th>Status</th><th /></tr></thead>
              <tbody>{mine.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{range(r)}{r.halfDay && <span className="hint"> (half day)</span>}</td>
                  <td>{r.type === "PAID" ? "Paid" : "Unpaid"}</td><td>{r.days}</td><td>{r.reason ?? "—"}</td>
                  <td><Status s={r.status} />{r.decisionNote && <div className="hint">“{r.decisionNote}”</div>}</td>
                  <td style={{ textAlign: "right" }}>{r.status === "PENDING" && <button className="btn btn-ghost btn-sm" onClick={() => cancel(r.id)}>Cancel</button>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}

      {tab === "team" && (
        <div className="card">
          {team.length === 0 ? <Empty title="No team requests" /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Employee</th><th>Dates</th><th>Type</th><th>Days</th><th>Reason</th><th>Status</th><th /></tr></thead>
              <tbody>{team.map((r) => (
                <tr key={r.id}>
                  <td><div className="user-cell"><Avatar name={r.user.name} /><div style={{ fontWeight: 600 }}>{r.user.name}</div></div></td>
                  <td>{range(r)}{r.halfDay && <span className="hint"> (half)</span>}</td>
                  <td>{r.type === "PAID" ? "Paid" : "Unpaid"}</td><td>{r.days}</td><td>{r.reason ?? "—"}</td>
                  <td><Status s={r.status} /></td>
                  <td className="actions" style={{ justifyContent: "flex-end" }}>
                    {r.status === "PENDING" && (
                      <>
                        <button className="btn btn-success btn-sm" onClick={() => { setDecide({ r, decision: "APPROVE" }); setNote(""); }}><Check size={14} /> Approve</button>
                        <button className="btn btn-sm" onClick={() => { setDecide({ r, decision: "REJECT" }); setNote(""); }}><XIcon size={14} /> Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}

      {open && <RequestModal remaining={bal.remaining} onClose={() => setOpen(false)} onDone={() => { setOpen(false); toast("Leave requested"); load(); }} />}

      {decide && (
        <Modal title={decide.decision === "APPROVE" ? "Approve leave" : "Reject leave"} onClose={() => setDecide(null)}
          footer={<><button className="btn" onClick={() => setDecide(null)}>Cancel</button>
            <button className={`btn ${decide.decision === "APPROVE" ? "btn-success" : "btn-danger"}`} disabled={busy || (decide.decision === "REJECT" && !note.trim())} onClick={submitDecision}>{busy ? <Spinner /> : decide.decision === "APPROVE" ? "Approve" : "Reject"}</button></>}>
          <p style={{ marginBottom: 14 }}><b>{decide.r.user.name}</b> · {range(decide.r)} · {decide.r.days} day(s) {decide.r.type === "PAID" ? "paid" : "unpaid"}</p>
          <Field label={decide.decision === "REJECT" ? "Reason for rejecting" : "Note"} hint={decide.decision === "APPROVE" ? "Optional" : undefined}>
            <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          </Field>
        </Modal>
      )}
    </>
  );
}

function RequestModal({ remaining, onClose, onDone }: { remaining: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const today = isoDate();
  const [f, setF] = useState({ type: "PAID", startDate: today, endDate: today, halfDay: false, reason: "" });
  const [busy, setBusy] = useState(false);
  const single = f.startDate === f.endDate;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await api("/api/leaves", { body: { ...f, halfDay: single && f.halfDay, ...(f.reason ? {} : { reason: undefined }) } }); onDone(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", true); setBusy(false); }
  }

  return (
    <Modal title="Request leave" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="leave" disabled={busy}>{busy ? <Spinner /> : "Submit request"}</button></>}>
      <form id="leave" onSubmit={submit}>
        <div className="alert alert-info">You have <b>{remaining}</b> paid day(s) remaining. Weekends and non-working days aren’t counted.</div>
        <Field label="Type">
          <select className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="PAID">Paid leave</option><option value="UNPAID">Unpaid leave</option>
          </select>
        </Field>
        <div className="row">
          <Field label="From"><input type="date" className="input" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value, endDate: e.target.value > f.endDate ? e.target.value : f.endDate })} required /></Field>
          <Field label="To"><input type="date" className="input" min={f.startDate} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} required /></Field>
        </div>
        {single && <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}><input type="checkbox" checked={f.halfDay} onChange={(e) => setF({ ...f, halfDay: e.target.checked })} /> Half day</label>}
        <Field label="Reason" hint="Optional"><textarea className="textarea" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={190} /></Field>
      </form>
    </Modal>
  );
}
