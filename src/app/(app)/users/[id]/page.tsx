"use client";

import { use, useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useMail } from "@/lib/client/mail";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { DAY_NAMES, fmtDate, fmtDateTime, fmtMinutes, fmtTime, isoDate, ROLE_LABEL, ROLE_RANK } from "@/lib/client/format";
import { WeekCard, TaskMixCard } from "@/components/dashboard-widgets";
import { fmtH } from "@/components/charts";
import { Avatar, Empty, Field, Loading, PageHeader, RoleBadge, StatusBadge, useToast } from "@/components/ui";

type Tab = "analytics" | "profile" | "schedule" | "salary" | "leaves" | "attendance" | "mailbox";

export default function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user: me } = useAuth();
  const toast = useToast();
  const [u, setU] = useState<any>(null);
  const initialTab = useSearchParams().get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(initialTab ?? "profile");

  const load = useCallback(() => api(`/api/users/${id}`).then((r) => setU(r.user)), [id]);
  useEffect(() => { load().catch((e) => toast(e.message, true)); }, [load, toast]);

  if (!u || !me) return <Loading />;
  const outranks = me.role === "SUPER_ADMIN" || ROLE_RANK[me.role] > ROLE_RANK[u.role];
  const canSchedule = outranks && ROLE_RANK[me.role] >= ROLE_RANK.MANAGER;
  const canSalary = outranks && ROLE_RANK[me.role] >= ROLE_RANK.COMPANY_HEAD;
  const tabs: [Tab, string][] = [["analytics", "Analytics"], ["profile", "Profile"], ["schedule", "Work schedule"], ...(canSalary ? [["salary", "Salary"] as [Tab, string]] : []), ["leaves", "Paid leave"], ["attendance", "Attendance"], ["mailbox", "Mailbox"]];

  return (
    <>
      <PageHeader crumbs={[{ label: "My PALs", href: "/users" }, { label: u.name }]} title={u.name} subtitle={u.email} actions={<RoleBadge role={u.role} designation={u.designation} />} />
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={`tab${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "analytics" && <UserAnalytics uid={u.id} />}
      {tab === "profile" && <Profile u={u} outranks={outranks} me={me} reload={load} />}
      {tab === "schedule" && <Schedule uid={u.id} canEdit={canSchedule} />}
      {tab === "salary" && <Salary uid={u.id} />}
      {tab === "leaves" && <Leaves uid={u.id} canEdit={canSchedule} />}
      {tab === "attendance" && <AttendanceTab uid={u.id} />}
      {tab === "mailbox" && <MailboxTab u={u} isSelf={u.id === me.id} reload={load} />}
    </>
  );
}

function Profile({ u, outranks, me, reload }: { u: any; outranks: boolean; me: any; reload: () => void }) {
  const toast = useToast();
  const [history, setHistory] = useState<any[] | null>(null);
  const [role, setRole] = useState(u.role);
  const [designation, setDesignation] = useState(u.designation ?? "");
  const [note, setNote] = useState("");
  const roles = Object.keys(ROLE_RANK).filter((r) => me.role === "SUPER_ADMIN" || ROLE_RANK[r] < ROLE_RANK[me.role]);
  const loadHistory = useCallback(() => api(`/api/users/${u.id}/role-history`).then((r) => setHistory(r.history)), [u.id]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function promote(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/users/${u.id}/promote`, { body: { role, designation: designation || null, ...(note && { note }) } });
      toast(ROLE_RANK[role] > ROLE_RANK[u.role] ? "User promoted" : "Role updated");
      setNote("");
      reload(); loadHistory();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
  }
  async function toggleActive() {
    try { await api(`/api/users/${u.id}`, { method: "PATCH", body: { isActive: !u.isActive } }); toast(u.isActive ? "User deactivated" : "User activated"); reload(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
  }

  return (
    <div className="grid grid-2">
      <div className="card card-pad">
        <div className="user-cell" style={{ marginBottom: 18 }}>
          <Avatar name={u.name} /><div><strong>{u.name}</strong><div className="sub">{u.email}</div></div>
        </div>
        <dl className="kv">
          <dt>Role</dt><dd>{ROLE_LABEL[u.role]}</dd>
          <dt>Designation</dt><dd>{u.designation || "—"}</dd>
          <dt>Status</dt><dd>{u.isActive ? <span className="badge b-green">Active</span> : <span className="badge b-gray">Inactive</span>}</dd>
          <dt>Joined</dt><dd>{fmtDate(u.createdAt)}</dd>
        </dl>
        {outranks && u.id !== me.id && <button className={`btn ${u.isActive ? "btn-danger" : ""}`} style={{ marginTop: 16 }} onClick={toggleActive}>{u.isActive ? "Deactivate user" : "Activate user"}</button>}
      </div>

      <div className="card card-pad">
        <h3 style={{ marginBottom: 14 }}>Promote / change role</h3>
        {outranks && u.id !== me.id ? (
          <form onSubmit={promote}>
            <div className="row">
              <Field label="New role"><select className="select" value={role} onChange={(e) => setRole(e.target.value)}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
              <Field label="Designation"><input className="input" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="CEO, CTO…" /></Field>
            </div>
            <Field label="Note" hint="Optional — recorded in role history"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <button className="btn btn-primary" disabled={role === u.role && designation === (u.designation ?? "")}>Update role</button>
          </form>
        ) : <p className="hint">You can’t change this user’s role.</p>}
      </div>

      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="card-head"><h3>Role history</h3></div>
        {!history ? <Loading /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>When</th><th>From</th><th>To</th><th>Note</th></tr></thead>
            <tbody>{history.map((h) => <tr key={h.id}><td>{fmtDateTime(h.createdAt)}</td><td>{h.fromRole ? ROLE_LABEL[h.fromRole] : "—"}</td><td>{ROLE_LABEL[h.toRole]}</td><td>{h.note ?? "—"}</td></tr>)}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function Schedule({ uid, canEdit }: { uid: number; canEdit: boolean }) {
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [exists, setExists] = useState(false);
  const [s, setS] = useState({ startTime: "09:00", endTime: "18:00", workingDays: [1, 2, 3, 4, 5], requiredMinutes: 480, halfDayMinutes: 240, lateGraceMinutes: 15, earlyGraceMinutes: 15, paidLeavesPerYear: 12 });

  useEffect(() => {
    api(`/api/users/${uid}/schedule`).then((r) => {
      if (r.schedule) { setS({ ...s, ...r.schedule }); setExists(true); }
      setLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const { startTime, endTime, workingDays, requiredMinutes, halfDayMinutes, lateGraceMinutes, earlyGraceMinutes, paidLeavesPerYear } = s;
    try {
      await api(`/api/users/${uid}/schedule`, { method: "PUT", body: { startTime, endTime, workingDays, requiredMinutes, halfDayMinutes, lateGraceMinutes, earlyGraceMinutes, paidLeavesPerYear } });
      setExists(true);
      toast("Schedule saved");
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
  }
  const num = (k: keyof typeof s) => (e: { target: { value: string } }) => setS({ ...s, [k]: Number(e.target.value) });

  if (!loaded) return <Loading />;
  if (!canEdit && !exists) return <div className="card"><Empty title="No schedule set" /></div>;
  return (
    <form className="card card-pad" onSubmit={save} style={{ maxWidth: 720 }}>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="row">
          <Field label="Start time"><input type="time" className="input" value={s.startTime} onChange={(e) => setS({ ...s, startTime: e.target.value })} /></Field>
          <Field label="End time"><input type="time" className="input" value={s.endTime} onChange={(e) => setS({ ...s, endTime: e.target.value })} /></Field>
        </div>
        <Field label="Working days">
          <div className="chip-days">
            {DAY_NAMES.map((d, i) => (
              <button type="button" key={d} className={`chip${s.workingDays.includes(i) ? " on" : ""}`}
                onClick={() => setS({ ...s, workingDays: s.workingDays.includes(i) ? s.workingDays.filter((x) => x !== i) : [...s.workingDays, i].sort() })}>{d}</button>
            ))}
          </div>
        </Field>
        <div className="row">
          <Field label="Full-day minutes" hint="Needed for “Present”"><input type="number" className="input" value={s.requiredMinutes} onChange={num("requiredMinutes")} /></Field>
          <Field label="Half-day minutes"><input type="number" className="input" value={s.halfDayMinutes} onChange={num("halfDayMinutes")} /></Field>
        </div>
        <div className="row">
          <Field label="Late grace (min)"><input type="number" className="input" value={s.lateGraceMinutes} onChange={num("lateGraceMinutes")} /></Field>
          <Field label="Early-leave grace (min)"><input type="number" className="input" value={s.earlyGraceMinutes} onChange={num("earlyGraceMinutes")} /></Field>
          <Field label="Paid leaves / year"><input type="number" className="input" value={s.paidLeavesPerYear} onChange={num("paidLeavesPerYear")} /></Field>
        </div>
      </fieldset>
      {canEdit && <button className="btn btn-primary">Save schedule</button>}
    </form>
  );
}

function Salary({ uid }: { uid: number }) {
  const toast = useToast();
  const [d, setD] = useState<any>(null);
  const [f, setF] = useState({ amount: "", effectiveFrom: isoDate(), reason: "" });
  const load = useCallback(() => api(`/api/users/${uid}/salary`).then(setD), [uid]);
  useEffect(() => { load(); }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/users/${uid}/salary`, { body: { amount: Number(f.amount), effectiveFrom: f.effectiveFrom, ...(f.reason && { reason: f.reason }) } });
      toast("Salary updated");
      setF({ ...f, amount: "", reason: "" });
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
  }
  if (!d) return <Loading />;
  const money = (a: string, c: string) => new Intl.NumberFormat(undefined, { style: "currency", currency: c }).format(Number(a));

  return (
    <div className="grid grid-main">
      <div className="card">
        <div className="card-head"><h3>Salary history</h3></div>
        {d.history.length === 0 ? <Empty title="No salary recorded" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Effective</th><th>Amount</th><th>Reason</th></tr></thead>
            <tbody>{d.history.map((h: any) => (
              <tr key={h.id}><td>{fmtDate(h.effectiveFrom)} {d.current?.id === h.id && <span className="badge b-green">Current</span>}</td><td style={{ fontWeight: 600 }}>{money(h.amount, h.currency)}</td><td>{h.reason ?? "—"}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      <form className="card card-pad" onSubmit={add}>
        <h3 style={{ marginBottom: 14 }}>{d.history.length ? "Add increment" : "Set salary"}</h3>
        <Field label="New amount"><input type="number" step="0.01" min="0" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></Field>
        <Field label="Effective from"><input type="date" className="input" value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} required /></Field>
        <Field label="Reason" hint="Optional, e.g. annual appraisal"><input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <button className="btn btn-primary">Save</button>
      </form>
    </div>
  );
}

function Leaves({ uid, canEdit }: { uid: number; canEdit: boolean }) {
  const toast = useToast();
  const [d, setD] = useState<any>(null);
  const [f, setF] = useState({ days: "", reason: "" });
  const load = useCallback(() => api(`/api/users/${uid}/leaves`).then(setD), [uid]);
  useEffect(() => { load(); }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    try { await api(`/api/users/${uid}/leaves`, { body: { days: Number(f.days), ...(f.reason && { reason: f.reason }) } }); toast("Add-on leave granted"); setF({ days: "", reason: "" }); load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
  }
  if (!d) return <Loading />;
  return (
    <div className="grid grid-main">
      <div>
        <div className="grid grid-4" style={{ marginBottom: 20 }}>
          <div className="card stat"><div><div className="num">{d.base}</div><div className="cap">Yearly quota</div></div></div>
          <div className="card stat"><div><div className="num">+{d.addOnDays}</div><div className="cap">Add-on days</div></div></div>
          <div className="card stat"><div><div className="num">{d.totalPaidLeaves}</div><div className="cap">Total paid leave ({d.year})</div></div></div>
          <div className="card stat"><div><div className="num" style={{ color: "var(--success)" }}>{d.remaining}</div><div className="cap">Remaining · {d.used} taken · {d.pending} pending</div></div></div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Add-on grants</h3></div>
          {d.addOns.length === 0 ? <Empty title="No add-on leave granted" /> : (
            <div className="table-wrap"><table className="table"><thead><tr><th>Granted</th><th>Days</th><th>Reason</th></tr></thead>
              <tbody>{d.addOns.map((a: any) => <tr key={a.id}><td>{fmtDate(a.createdAt)}</td><td>+{a.days}</td><td>{a.reason ?? "—"}</td></tr>)}</tbody></table></div>
          )}
        </div>
      </div>
      {canEdit && (
        <form className="card card-pad" onSubmit={add} style={{ alignSelf: "start" }}>
          <h3 style={{ marginBottom: 14 }}>Grant extra paid leave</h3>
          <Field label="Days"><input type="number" step="0.5" min="0.5" className="input" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} required /></Field>
          <Field label="Reason" hint="Optional"><input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          <button className="btn btn-primary">Grant leave</button>
        </form>
      )}
    </div>
  );
}

function AttendanceTab({ uid }: { uid: number }) {
  const [days, setDays] = useState<any[] | null>(null);
  useEffect(() => { api(`/api/attendance?userId=${uid}`).then((r) => setDays(r.days)); }, [uid]);
  if (!days) return <Loading />;
  return (
    <div className="card">
      {days.length === 0 ? <Empty title="No attendance recorded" /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Worked</th><th>Status</th><th>Flags</th></tr></thead>
          <tbody>{days.map((d) => (
            <tr key={d.id}><td style={{ fontWeight: 600 }}>{fmtDate(d.date)}</td><td>{fmtTime(d.firstStartAt)}</td><td>{fmtTime(d.lastStopAt)}</td><td>{fmtMinutes(d.totalWorkMinutes)}</td><td><StatusBadge status={d.status} /></td>
              <td className="actions">{d.isLate && <span className="badge b-red">Late {d.lateMinutes}m</span>}{d.isEarlyCheckout && <span className="badge b-amber">Early {d.earlyMinutes}m</span>}{!d.isLate && !d.isEarlyCheckout && "—"}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

function MailboxTab({ u, isSelf, reload }: { u: any; isSelf: boolean; reload: () => void }) {
  const toast = useToast();
  const { recheckConfig } = useMail();
  const [f, setF] = useState({ mailEmail: u.mailEmail ?? "", mailPassword: "" });
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/users/${u.id}/mailbox`, { method: "PUT", body: f });
      toast("Mailbox connected");
      setF({ ...f, mailPassword: "" });
      reload();
      if (isSelf) recheckConfig();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
    finally { setBusy(false); }
  }
  async function remove() {
    try { await api(`/api/users/${u.id}/mailbox`, { method: "DELETE" }); toast("Mailbox removed"); setF({ mailEmail: "", mailPassword: "" }); reload(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
  }
  return (
    <form className="card card-pad" onSubmit={save} style={{ maxWidth: 520 }}>
      <h3 style={{ marginBottom: 4 }}>Company mailbox</h3>
      <p className="hint" style={{ marginBottom: 16 }}>Connects to mail.palqar.com. The sign-in is verified before saving and the password is stored encrypted.</p>
      <Field label="Email address"><input type="email" className="input" placeholder="name@palqar.com" value={f.mailEmail} onChange={(e) => setF({ ...f, mailEmail: e.target.value })} required /></Field>
      <Field label="Mailbox password" hint={u.mailEmail ? "Enter the password to change or re-verify the connection" : undefined}><input type="password" className="input" autoComplete="new-password" value={f.mailPassword} onChange={(e) => setF({ ...f, mailPassword: e.target.value })} required /></Field>
      <div className="actions">
        <button className="btn btn-primary" disabled={busy}>{busy ? "Verifying…" : u.mailEmail ? "Update mailbox" : "Connect mailbox"}</button>
        {u.mailEmail && <button type="button" className="btn btn-danger" onClick={remove}>Remove</button>}
      </div>
    </form>
  );
}

function UserAnalytics({ uid }: { uid: number }) {
  const [a, setA] = useState<any>(null);
  useEffect(() => { api(`/api/analytics/me?userId=${uid}`).then(setA); }, [uid]);
  if (!a) return <Loading />;
  const STATE: Record<string, string> = { NOT_STARTED: "Not checked in", WORKING: "Working", PAUSED: "On break", STOPPED: "Checked out" };
  return (
    <>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span><span className="kpi-num">{STATE[a.today.state]}</span><span className="kpi-cap">Today{a.today.isLate ? " · late" : ""}</span></span></div>
        <div className="card kpi"><span><span className="kpi-num">{fmtH(a.today.workedMinutes)}</span><span className="kpi-cap">Worked today / {fmtH(a.requiredMinutes)}</span></span></div>
        <div className="card kpi"><span><span className="kpi-num">{a.tasks.open}</span><span className="kpi-cap">Open tasks</span></span></div>
        <div className="card kpi"><span><span className="kpi-num" style={a.tasks.overdue ? { color: "var(--danger)" } : undefined}>{a.tasks.overdue}</span><span className="kpi-cap">Overdue</span></span></div>
        <div className="card kpi"><span><span className="kpi-num">{a.leave.remaining}</span><span className="kpi-cap">Leave days left</span></span></div>
      </div>
      <div className="dash-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <WeekCard week={a.week} target={a.requiredMinutes} />
        <TaskMixCard counts={a.tasks.byStatus} overdue={a.tasks.overdue} completedThisWeek={a.tasks.completedThisWeek} />
      </div>
    </>
  );
}
