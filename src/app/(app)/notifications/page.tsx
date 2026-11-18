"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Mail } from "lucide-react";
import { api } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";
import { noticeIcon, useNotifications, type Notice } from "@/lib/client/notifications";
import { Empty, Loading, PageHeader, Spinner, useToast } from "@/components/ui";

const PAGE = 20;

export default function NotificationsPage() {
  const router = useRouter();
  const toast = useToast();
  const { unread, markRead, refresh } = useNotifications();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [category, setCategory] = useState<"" | "task" | "leave" | "request" | "meeting" | "lead">("");
  const [items, setItems] = useState<Notice[] | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(true);

  const qs = useCallback((before?: number) => {
    const q = new URLSearchParams({ limit: String(PAGE), filter });
    if (category) q.set("category", category);
    if (before) q.set("before", String(before));
    return q.toString();
  }, [filter, category]);

  useEffect(() => {
    setItems(null);
    api(`/api/notifications?${qs()}`).then((r) => { setItems(r.notifications); setMore(r.notifications.length === PAGE); setEmailEnabled(r.emailEnabled); });
  }, [qs, unread]); // re-load when the unread count changes (read elsewhere / new arrivals)

  async function loadMore() {
    if (!items?.length) return;
    setBusy(true);
    const r = await api(`/api/notifications?${qs(items[items.length - 1].id)}`);
    setItems([...items, ...r.notifications]);
    setMore(r.notifications.length === PAGE);
    setBusy(false);
  }
  async function open(n: Notice) {
    if (!n.readAt) await markRead({ ids: [n.id] }).catch(() => {});
    router.push(n.link ?? "/dashboard");
  }
  async function toggleEmail() {
    const next = !emailEnabled;
    setEmailEnabled(next);
    try { await api("/api/notifications/preferences", { method: "PUT", body: { emailEnabled: next } }); toast(next ? "Email notifications on" : "Email notifications off"); }
    catch (e) { setEmailEnabled(!next); toast(e instanceof Error ? e.message : "Failed", true); }
  }

  return (
    <>
      <PageHeader title="Notifications" subtitle="Task assignments, reviews and leave decisions."
        actions={<button className="btn" disabled={unread === 0} onClick={async () => { await markRead({ all: true }); refresh(); }}><CheckCheck size={16} /> Mark all as read</button>} />

      <div className="toolbar">
        <div className="seg">
          {(["all", "unread"] as const).map((f) => <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f === "all" ? "All" : `Unread${unread ? ` (${unread})` : ""}`}</button>)}
        </div>
        <div className="seg">
          {([["", "Everything"], ["task", "Tasks"], ["request", "Requests"], ["meeting", "Meetings"], ["lead", "Leads"], ["leave", "Leave"]] as const).map(([k, l]) => <button key={k} className={category === k ? "on" : ""} onClick={() => setCategory(k)}>{l}</button>)}
        </div>
        <label className="chip" style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={emailEnabled} onChange={toggleEmail} /> <Mail size={14} /> Email me a copy
        </label>
      </div>

      <div className="card">
        {!items ? <Loading /> : items.length === 0 ? <Empty title={filter === "unread" ? "No unread notifications" : "No notifications yet"} /> : (
          <div className="list">
            {items.map((n) => (
              <div key={n.id} className={`list-row notice big${n.readAt ? "" : " unread"}`} onClick={() => open(n)}>
                <span className="notice-ico">{(() => { const I = noticeIcon(n.type); return <I size={16} />; })()}</span>
                <div className="grow-min">
                  <div className="title-line"><span className="t">{n.title}</span>{!n.readAt && <span className="badge b-purple">New</span>}</div>
                  {n.body && <div className="sub-line" style={{ whiteSpace: "normal" }}>{n.body}</div>}
                </div>
                <span className="hint nowrap">{fmtDateTime(n.createdAt)}</span>
              </div>
            ))}
            {more && <div style={{ padding: 12, textAlign: "center" }}><button className="btn btn-sm" onClick={loadMore} disabled={busy}>{busy ? <Spinner /> : "Load more"}</button></div>}
          </div>
        )}
      </div>
    </>
  );
}
