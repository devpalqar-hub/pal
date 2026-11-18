"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Mail, LayoutDashboard, Clock, FolderKanban, CheckSquare, Users, LogOut, Menu, Sparkles, CalendarOff, CalendarClock, FileCheck2, BarChart3, PanelLeftClose, PanelLeftOpen, Eye, Target } from "lucide-react";
import { useAuth } from "@/lib/client/auth";
import { MailProvider, useMail } from "@/lib/client/mail";
import { NotificationProvider, useNotifications } from "@/lib/client/notifications";
import { NotificationBell } from "./notification-bell";
import { GoToPalNo } from "./pal-no";
import { Avatar, RoleBadge, Spinner } from "@/components/ui";
import { ROLE_LABEL, ROLE_RANK } from "@/lib/client/format";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, error, retry, logout } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user && !error) router.replace("/login");
  }, [user, loading, error, router]);
  if (!loading && !user && error) {
    return (
      <div className="center-screen">
        <div className="card card-pad" style={{ maxWidth: 380, textAlign: "center" }}>
          <h3 style={{ marginBottom: 6 }}>Connection problem</h3>
          <p className="hint" style={{ marginBottom: 16 }}>{error} You are still signed in — try again.</p>
          <div className="actions" style={{ justifyContent: "center" }}><button className="btn btn-primary" onClick={retry}>Try again</button><button className="btn" onClick={logout}>Sign out</button></div>
        </div>
      </div>
    );
  }
  if (loading || !user) return <div className="center-screen"><Spinner /></div>;
  return <MailProvider><NotificationProvider><Frame>{children}</Frame></NotificationProvider></MailProvider>;
}

function Frame({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const mail = useMail();
  const notices = useNotifications();
  const totalUnread = (mail.unseen || 0) + notices.unread;
  useEffect(() => { document.title = `${totalUnread > 0 ? `(${totalUnread}) ` : ""}PAL`; }, [totalUnread]);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCollapsed(localStorage.getItem("pal_sb") === "1"), []);
  const toggle = () => setCollapsed((c) => { localStorage.setItem("pal_sb", c ? "0" : "1"); return !c; });

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);
  useEffect(() => setOpen(false), [pathname]);

  if (loading || !user) return <div className="center-screen"><Spinner /></div>;

  const rank = ROLE_RANK[user.role];
  type Item = { href: string; label: string; icon: typeof Mail; badge?: number };
  const groups: { title: string; items: Item[] }[] = [
    {
      title: "Workspace",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/tasks", label: "My Tasks", icon: CheckSquare, badge: notices.unreadTaskIds.size },
        { href: "/projects", label: "Projects", icon: FolderKanban },
        { href: "/leads", label: "Leads", icon: Target },
        { href: "/assistant", label: "AI assistant", icon: Sparkles },
        { href: "/requests", label: "Requests", icon: FileCheck2, badge: notices.requestActions },
        { href: "/meetings", label: "Meetings", icon: CalendarClock },
        { href: "/attendance", label: "Attendance", icon: Clock },
        { href: "/leave", label: "Leave", icon: CalendarOff },
        ...(mail.configured !== false ? [{ href: "/mail", label: "Mail", icon: Mail, badge: mail.unseen }] : []),
      ],
    },
    ...(rank >= ROLE_RANK.LEAD
      ? [{
          title: "Management",
          items: [
            { href: "/team", label: "Team", icon: Eye },
            { href: "/users", label: "My PALs", icon: Users },
            ...(rank >= ROLE_RANK.MANAGER ? [{ href: "/analytics", label: "Analytics", icon: BarChart3 }] : []),
          ],
        }]
      : []),
  ];

  return (
    <div className="shell">
      <aside className={`sidebar${open ? " open" : ""}${collapsed ? " collapsed" : ""}`}>
        <div className="brand"><div className="brand-mark">P</div><span className="lbl">PAL</span></div>
        <nav className="nav">
          {groups.map((g) => (
            <div key={g.title} className="nav-group">
              <div className="nav-label lbl">{g.title}</div>
              {g.items.map((n) => (
                <Link key={n.href} href={n.href} title={n.label} className={pathname === n.href || pathname.startsWith(n.href + "/") ? "active" : ""}>
                  <n.icon size={18} /> <span className="lbl">{n.label}</span>
                  {!!n.badge && n.badge > 0 && <span className="nav-badge">{n.badge}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <button className="collapse-btn" onClick={toggle} title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />} <span className="lbl">Collapse</span>
        </button>
        <div className="sidebar-user">
          <Avatar name={user.name} />
          <div className="meta lbl">
            <div className="name">{user.name}</div>
            <div className="role">{user.designation || ROLE_LABEL[user.role]}</div>
          </div>
          <button className="btn btn-ghost btn-sm lbl" onClick={logout} title="Sign out" style={{ color: "#94a3b8", padding: "0 6px" }}><LogOut size={17} /></button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-sm mobile-only" onClick={() => setOpen((o) => !o)} aria-label="Menu"><Menu size={20} /></button>
          <div className="grow" />
          <GoToPalNo />
          <NotificationBell />
          {mail.configured && (
            <Link href="/mail" className="btn btn-ghost btn-sm" title="Inbox" style={{ position: "relative" }}>
              <Mail size={18} />
              {mail.unseen > 0 && <span className="badge b-red" style={{ position: "absolute", top: -4, right: -6, padding: "0 6px" }}>{mail.unseen}</span>}
            </Link>
          )}
          <RoleBadge role={user.role} designation={user.designation} />
          <span style={{ color: "var(--muted)" }} className="hide-sm">{user.email}</span>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
