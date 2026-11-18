"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { X, Inbox, ChevronRight } from "lucide-react";
import { initials, ROLE_LABEL } from "@/lib/client/format";

export function Avatar({ name, small }: { name: string; small?: boolean }) {
  return <div className={`avatar${small ? " avatar-sm" : ""}`} title={name}>{initials(name)}</div>;
}

export function Spinner() {
  return <span className="spinner" />;
}

export function Loading() {
  return (
    <div className="empty">
      <Spinner />
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={36} />
      <div style={{ fontWeight: 600, color: "#334155" }}>{title}</div>
      {children && <div style={{ marginTop: 4 }}>{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, crumbs }: { title: string; subtitle?: string; actions?: ReactNode; crumbs?: { label: string; href?: string }[] }) {
  return (
    <div className="page-header">
      <div>
        {crumbs && (
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {c.href ? <Link href={c.href}>{c.label}</Link> : c.label}
                {i < crumbs.length - 1 && <ChevronRight size={14} />}
              </span>
            ))}
          </div>
        )}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide, width, icon, subtitle }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; width?: number; icon?: ReactNode; subtitle?: string }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { maxWidth: width } : wide ? { maxWidth: 680 } : undefined}>
        <div className="modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {icon && <span className="modal-icon">{icon}</span>}
            <div><h3>{title}</h3>{subtitle && <p className="hint" style={{ marginTop: 2 }}>{subtitle}</p>}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

const ROLE_TONE: Record<string, string> = { SUPER_ADMIN: "b-red", COMPANY_HEAD: "b-purple", MANAGER: "b-blue", LEAD: "b-amber", STAFF: "b-gray" };
export function RoleBadge({ role, designation }: { role: string; designation?: string | null }) {
  return <span className={`badge ${ROLE_TONE[role] ?? "b-gray"}`}>{designation || ROLE_LABEL[role] || role}</span>;
}

const STATUS_TONE: Record<string, [string, string]> = {
  TODO: ["b-gray", "To do"],
  IN_PROGRESS: ["b-blue", "In progress"],
  PAUSED: ["b-amber", "Paused"],
  COMPLETED: ["b-green", "Completed"],
  IN_REVIEW: ["b-purple", "In review"],
  ENDED: ["b-gray", "Ended"],
  ACTIVE: ["b-green", "Active"],
  ON_HOLD: ["b-amber", "On hold"],
  ARCHIVED: ["b-gray", "Archived"],
  PRESENT: ["b-green", "Present"],
  HALF_DAY: ["b-amber", "Half day"],
  ABSENT: ["b-red", "Absent"],
};
export function StatusBadge({ status }: { status: string }) {
  const [cls, label] = STATUS_TONE[status] ?? ["b-gray", status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

const PRIORITY_TONE: Record<string, string> = { LOW: "b-gray", MEDIUM: "b-blue", HIGH: "b-amber", URGENT: "b-red" };
export function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`badge ${PRIORITY_TONE[priority]}`}>{priority[0] + priority.slice(1).toLowerCase()}</span>;
}

/* ── Toasts ── */
type Toast = { id: number; text: string; error?: boolean };
const ToastCtx = createContext<(text: string, error?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, error?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.error ? " error" : ""}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
