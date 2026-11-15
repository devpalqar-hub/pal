"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Users, CheckSquare, CalendarDays } from "lucide-react";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { fmtDate, ROLE_RANK } from "@/lib/client/format";
import { Empty, Field, Loading, Modal, PageHeader, Spinner, StatusBadge, useToast } from "@/components/ui";

export default function ProjectsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [projects, setProjects] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", description: "", startDate: "", dueDate: "" });
  const [busy, setBusy] = useState(false);
  const canCreate = ROLE_RANK[user!.role] >= ROLE_RANK.MANAGER;

  const load = useCallback(() => api("/api/projects").then((r) => setProjects(r.projects)), []);
  useEffect(() => { load(); }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { project } = await api("/api/projects", {
        body: { name: f.name, ...(f.description && { description: f.description }), ...(f.startDate && { startDate: f.startDate }), ...(f.dueDate && { dueDate: f.dueDate }) },
      });
      toast("Project created");
      router.push(`/projects/${project.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", true);
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Projects" subtitle="All the projects you’re part of." actions={canCreate && <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New project</button>} />
      {!projects ? <Loading /> : projects.length === 0 ? (
        <div className="card"><Empty title="No projects yet">{canCreate ? "Create your first project to get started." : "You’ll see projects here once you’re added to one."}</Empty></div>
      ) : (
        <div className="grid grid-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="card card-pad" style={{ display: "block", transition: "box-shadow .15s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <h3 style={{ fontSize: 16 }}>{p.name}</h3><StatusBadge status={p.status} />
              </div>
              <p className="hint" style={{ minHeight: 40, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{p.description || "No description"}</p>
              <div className="task-meta" style={{ marginTop: 14 }}>
                <span><Users size={14} style={{ verticalAlign: -2 }} /> {p._count.members}</span>
                <span><CheckSquare size={14} style={{ verticalAlign: -2 }} /> {p._count.tasks}</span>
                <span className="push"><CalendarDays size={14} style={{ verticalAlign: -2 }} /> {fmtDate(p.dueDate)}</span>
              </div>
              <div className="hint" style={{ marginTop: 10 }}>Owner: {p.owner.name}</div>
            </Link>
          ))}
        </div>
      )}

      {open && (
        <Modal title="New project" onClose={() => setOpen(false)} footer={
          <><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" form="proj" disabled={busy}>{busy ? <Spinner /> : "Create project"}</button></>
        }>
          <form id="proj" onSubmit={create}>
            <Field label="Project name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoFocus /></Field>
            <Field label="Description" hint="Optional"><textarea className="textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <div className="row">
              <Field label="Start date" hint="Optional"><input type="date" className="input" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
              <Field label="Due date" hint="Optional"><input type="date" className="input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
