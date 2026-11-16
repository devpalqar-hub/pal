"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { fmtMailDate } from "@/lib/client/format";
import { REQUEST_TYPES, REQUEST_TYPE_MAP } from "@/lib/request-types";
import { Avatar, Empty, Loading, PageHeader, PriorityBadge } from "@/components/ui";
import { NewRequestModal, RequestDrawer, RequestStatus } from "@/components/request-parts";
import { useNotifications } from "@/lib/client/notifications";

type Box = "incoming" | "sent" | "all";
const STATUSES = ["", "PENDING", "RESUBMITTED", "REJECTED", "APPROVED", "COMPLETE", "CANCELLED"];

export default function RequestsPage() {
  const { user } = useAuth();
  const { refresh } = useNotifications();
  const params = useSearchParams();
  const seesAll = user!.role === "SUPER_ADMIN" || user!.role === "COMPANY_HEAD";
  const [box, setBox] = useState<Box>("incoming");
  const [rows, setRows] = useState<any[] | null>(null);
  const [counts, setCounts] = useState({ awaitingMe: 0, needsFix: 0, approvedForMe: 0 });
  const [f, setF] = useState({ status: "", type: "", q: "" });
  const [newOpen, setNewOpen] = useState(false);
  const [openId, setOpenId] = useState<number | null>(Number(params.get("open")) || null);
  useEffect(() => { const id = Number(params.get("open")) || null; if (id) setOpenId(id); }, [params]);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ box });
    if (f.status) q.set("status", f.status);
    if (f.type) q.set("type", f.type);
    const [r, s] = await Promise.all([api(`/api/requests?${q}`), api("/api/requests/summary")]);
    setRows(r.requests); setCounts(s);
  }, [box, f.status, f.type]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const shown = useMemo(() => (rows ?? []).filter((r) => !f.q || r.title.toLowerCase().includes(f.q.toLowerCase())), [rows, f.q]);
  const changed = () => { load(); refresh(); };

  return (
    <>
      <PageHeader title="Requests" subtitle="Project plans, deployments, repositories, pull requests and more — sent to a person for approval."
        actions={<button className="btn btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New request</button>} />

      <div className="tabs">
        <button className={`tab${box === "incoming" ? " active" : ""}`} onClick={() => setBox("incoming")}>For me {counts.awaitingMe + counts.approvedForMe > 0 && <span className="badge b-red">{counts.awaitingMe + counts.approvedForMe}</span>}</button>
        <button className={`tab${box === "sent" ? " active" : ""}`} onClick={() => setBox("sent")}>Sent by me {counts.needsFix > 0 && <span className="badge b-amber">{counts.needsFix} to fix</span>}</button>
        {seesAll && <button className={`tab${box === "all" ? " active" : ""}`} onClick={() => setBox("all")}>Everyone</button>}
      </div>

      <div className="toolbar">
        <div className="input-wrap" style={{ minWidth: 220 }}><Search size={15} style={{ top: 12 }} /><input className="input" placeholder="Search requests…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
        <select className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">All types</option>{REQUEST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
        <div className="seg">{STATUSES.map((s) => <button key={s} className={f.status === s ? "on" : ""} onClick={() => setF({ ...f, status: s })}>{s ? s[0] + s.slice(1).toLowerCase() : "All"}</button>)}</div>
      </div>

      <div className="card">
        {!rows ? <Loading /> : shown.length === 0 ? <Empty title="No requests here">{box === "incoming" ? "Requests sent to you will show up here." : "Use “New request” to ask someone for something."}</Empty> : (
          <div className="table-wrap"><table className="table compact-table">
            <thead><tr><th>Request</th><th>Type</th><th>{box === "sent" ? "Sent to" : box === "all" ? "From → To" : "From"}</th><th>Priority</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>
              {shown.map((r) => {
                const needsMe = (box === "incoming" && ["PENDING", "RESUBMITTED", "APPROVED"].includes(r.status)) || (box === "sent" && r.status === "REJECTED");
                const who = box === "sent" ? r.assignee : r.requester;
                return (
                  <tr key={r.id} className="click" onClick={() => setOpenId(r.id)}>
                    <td style={{ fontWeight: needsMe ? 700 : 600 }}>{needsMe && <span className="dot-new" style={{ marginRight: 8 }} title="Needs your action" />}{r.title}{r.resubmitCount > 0 && <span className="hint"> · resubmitted</span>}</td>
                    <td>{REQUEST_TYPE_MAP[r.type]?.label}</td>
                    <td>{box === "all" ? `${r.requester.name} → ${r.assignee.name}` : <span className="user-cell"><Avatar name={who.name} small />{who.name}</span>}</td>
                    <td><PriorityBadge priority={r.priority} /></td>
                    <td><RequestStatus status={r.status} /></td>
                    <td className="hint">{fmtMailDate(r.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>

      {newOpen && <NewRequestModal onClose={() => setNewOpen(false)} onCreated={(id) => { setNewOpen(false); setBox("sent"); changed(); setOpenId(id); }} />}
      {openId && <RequestDrawer requestId={openId} onClose={() => setOpenId(null)} onChanged={changed} />}
    </>
  );
}
