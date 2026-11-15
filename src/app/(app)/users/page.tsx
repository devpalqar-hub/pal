"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { assignableRoles, fmtDate, ROLE_LABEL } from "@/lib/client/format";
import { Avatar, Empty, Field, Loading, Modal, PageHeader, RoleBadge, Spinner, useToast } from "@/components/ui";

export default function UsersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [users, setUsers] = useState<any[] | null>(null);
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new") === "1");
  const [busy, setBusy] = useState(false);
  const roles = assignableRoles(user!.role);
  const [f, setF] = useState({ name: "", email: "", password: "", role: roles[roles.length - 1] ?? "STAFF", designation: "", mailEmail: "", mailPassword: "" });

  const load = useCallback(() => api(`/api/users${role ? `?role=${role}` : ""}`).then((r) => setUsers(r.users)), [role]);
  useEffect(() => { setUsers(null); load(); }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { mailEmail, mailPassword, ...rest } = f;
      await api("/api/users", { body: { ...rest, designation: f.designation || undefined, ...(mailEmail && { mailEmail, mailPassword }) } });
      toast("User created");
      setOpen(false);
      setF({ ...f, name: "", email: "", password: "", designation: "", mailEmail: "", mailPassword: "" });
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", true);
    } finally {
      setBusy(false);
    }
  }

  const shown = (users ?? []).filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="My PALs" subtitle="The PALs you manage — roles, schedules, salary, leave and analytics." actions={<button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Add a PAL</button>} />
      <div className="toolbar">
        <input className="input" placeholder="Search by name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </div>
      <div className="card">
        {!users ? <Loading /> : shown.length === 0 ? <Empty title="No users found" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th></tr></thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id} className="click" onClick={() => router.push(`/users/${u.id}`)}>
                  <td><div className="user-cell"><Avatar name={u.name} /><div><div style={{ fontWeight: 600 }}>{u.name}</div><div className="sub">{u.email}</div></div></div></td>
                  <td><RoleBadge role={u.role} designation={u.designation} /></td>
                  <td>{u.isActive ? <span className="badge b-green">Active</span> : <span className="badge b-gray">Inactive</span>}</td>
                  <td>{fmtDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      {open && (
        <Modal title="Add user" onClose={() => setOpen(false)} footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" form="newuser" disabled={busy}>{busy ? <Spinner /> : "Create user"}</button></>}>
          <form id="newuser" onSubmit={create}>
            <Field label="Full name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoFocus /></Field>
            <Field label="Email"><input type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
            <Field label="Temporary password" hint="At least 8 characters"><input type="password" className="input" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
            <div className="row">
              <Field label="Role"><select className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
              <Field label="Designation" hint="e.g. CEO, CTO, CFO, Partner"><input className="input" value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} /></Field>
            </div>
            <div className="alert alert-info" style={{ marginBottom: 12 }}>Company mailbox on mail.palqar.com (optional — can be added later)</div>
            <div className="row">
              <Field label="Mailbox email"><input type="email" className="input" placeholder="name@palqar.com" value={f.mailEmail} onChange={(e) => setF({ ...f, mailEmail: e.target.value })} required={!!f.mailPassword} /></Field>
              <Field label="Mailbox password"><input type="password" className="input" autoComplete="new-password" value={f.mailPassword} onChange={(e) => setF({ ...f, mailPassword: e.target.value })} required={!!f.mailEmail} /></Field>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
