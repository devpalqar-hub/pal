"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellRing, CheckCheck } from "lucide-react";
import { NOTICE_ICON, useNotifications, type Notice } from "@/lib/client/notifications";
import { desktopEnabled, desktopSupported, disableDesktop, enableDesktop } from "@/lib/client/desktop-notify";
import { fmtMailDate } from "@/lib/client/format";
import { useToast } from "./ui";

export function NotificationBell() {
  const { unread, latest, markRead } = useNotifications();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setDesktop(desktopEnabled()), []);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  async function go(n: Notice) {
    setOpen(false);
    if (!n.readAt) await markRead({ ids: [n.id] }).catch(() => {});
    router.push(n.link ?? "/notifications");
  }
  async function toggleDesktop() {
    if (desktop) { disableDesktop(); setDesktop(false); return; }
    const ok = await enableDesktop();
    setDesktop(ok);
    toast(ok ? "Desktop alerts on — you’ll be notified when this tab is in the background" : "Notifications are blocked in your browser settings", !ok);
  }

  return (
    <div className="bell" ref={ref}>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} title="Notifications" style={{ position: "relative" }}>
        {unread > 0 ? <BellRing size={18} /> : <Bell size={18} />}
        {unread > 0 && <span className="badge b-red bell-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel card">
          <div className="card-head tight">
            <h3>Notifications</h3>
            <button className="btn btn-ghost btn-sm" disabled={unread === 0} onClick={() => markRead({ all: true })}><CheckCheck size={14} /> Mark all read</button>
          </div>
          <div className="list scroll" style={{ maxHeight: 340 }}>
            {latest.length === 0 && <div className="empty tight">You’re all caught up</div>}
            {latest.slice(0, 8).map((n) => (
              <div key={n.id} className={`list-row notice${n.readAt ? "" : " unread"}`} onClick={() => go(n)}>
                <span className="notice-ico">{NOTICE_ICON[n.type] ?? "🔔"}</span>
                <div className="grow-min">
                  <div className="title-line"><span className="t">{n.title}</span></div>
                  {n.body && <div className="sub-line"><span className="ellipsis">{n.body}</span></div>}
                </div>
                <span className="hint nowrap">{fmtMailDate(n.createdAt)}</span>
              </div>
            ))}
          </div>
          <div className="bell-foot">
            <Link href="/notifications" onClick={() => setOpen(false)}>View all</Link>
            {desktopSupported() && <button onClick={toggleDesktop}>{desktop ? "Desktop alerts: on" : "Enable desktop alerts"}</button>}
          </div>
        </div>
      )}
    </div>
  );
}
