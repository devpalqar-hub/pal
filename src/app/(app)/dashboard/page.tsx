"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Clock, CheckSquare, AlertTriangle, Eye, CalendarOff, PenSquare, UserPlus, BarChart3, FolderKanban } from "lucide-react";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { IST, istHour, ROLE_LABEL, ROLE_RANK } from "@/lib/client/format";
import { Loading } from "@/components/ui";
import { WorkDayCard } from "@/components/work-day-card";
import { OpenTasksCard } from "@/components/open-tasks-card";
import { MailPanel } from "@/components/mail-panel";
import { TaskDrawer } from "@/components/task-drawer";
import { ProjectsHealthCard, TaskMixCard, TeamTodayCard, WeekCard } from "@/components/dashboard-widgets";
import { fmtH } from "@/components/charts";

export default function Dashboard() {
  const { user } = useAuth();
  const isLead = ROLE_RANK[user!.role] >= ROLE_RANK.MANAGER;
  const [d, setD] = useState<any>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [me, mine, review, projects, team] = await Promise.all([
      api("/api/analytics/me"),
      api("/api/tasks/me"),
      api("/api/tasks/me?role=reviewer"),
      api("/api/analytics/projects"),
      isLead ? api("/api/analytics/team") : Promise.resolve(null),
    ]);
    setD({ me, tasks: mine.tasks, review: review.tasks.length, projects: projects.projects, team, at: Date.now() });
  }, [isLead]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <Loading />;
  const h = istHour();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: IST });
  const first = user!.name.split(" ")[0];
  const { me } = d;

  const kpis = [
    { href: "/attendance", icon: Clock, tone: "ic-primary", value: fmtH(me.today.workedMinutes), label: "Worked today" },
    { href: "/tasks", icon: CheckSquare, tone: "ic-info", value: me.tasks.open, label: "Open tasks" },
    { href: "/tasks", icon: AlertTriangle, tone: me.tasks.overdue ? "ic-danger" : "ic-success", value: me.tasks.overdue, label: "Overdue" },
    { href: "/tasks", icon: Eye, tone: "ic-warning", value: d.review, label: "To review" },
    { href: "/leave", icon: CalendarOff, tone: "ic-purple", value: me.leave.remaining, label: "Leave days left" },
  ];
  const actions = [
    { href: "/tasks", icon: CheckSquare, label: "My tasks" },
    { href: "/leave?new=1", icon: CalendarOff, label: "Request leave" },
    { href: "/mail?compose=1", icon: PenSquare, label: "Compose" },
    ...(isLead ? [{ href: "/users?new=1", icon: UserPlus, label: "Add a PAL" }, { href: "/analytics", icon: BarChart3, label: "Analytics" }] : [{ href: "/projects", icon: FolderKanban, label: "Projects" }]),
  ];

  const team = isLead && d.team && (
    <div className="dash-row r-7-5">
      <TeamTodayCard team={d.team} />
      <ProjectsHealthCard projects={d.projects} />
    </div>
  );
  const work = (
    <div className="dash-row r-7-5">
      <OpenTasksCard tasks={d.tasks} fetchedAt={d.at} onOpen={setOpenId} onChanged={load} />
      <MailPanel />
    </div>
  );

  return (
    <div className="dash">
      <section className="hero">
        <div>
          <div className="hero-kicker">{dateLabel} · IST</div>
          <h1>{greet}, PAL {first} <span aria-hidden>👋</span></h1>
          <p>{user!.designation ? `${user!.designation} · ` : ""}{ROLE_LABEL[user!.role]}{isLead && d.team ? ` · ${d.team.summary.total} PALs in your team` : ""}{me.schedule ? ` · Shift ${me.schedule.startTime}–${me.schedule.endTime}` : ""}</p>
        </div>
        <nav className="hero-actions">
          {actions.map((a) => <Link key={a.label} href={a.href} className="hero-btn"><a.icon size={16} /> {a.label}</Link>)}
        </nav>
      </section>

      <section className="kpis">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="card kpi">
            <span className={`icon ${k.tone}`}><k.icon size={18} /></span>
            <span><span className="kpi-num">{k.value}</span><span className="kpi-cap">{k.label}</span></span>
          </Link>
        ))}
      </section>

      <div className="dash-row r-4-4-4">
        <WorkDayCard requiredMinutes={me.requiredMinutes} schedule={me.schedule} onChange={load} />
        <WeekCard week={me.week} target={me.requiredMinutes} />
        <TaskMixCard counts={me.tasks.byStatus} overdue={me.tasks.overdue} completedThisWeek={me.tasks.completedThisWeek} />
      </div>

      {isLead ? <>{team}{work}</> : (
        <>
          {work}
          <div className="dash-row r-12"><ProjectsHealthCard projects={d.projects} title="My projects" /></div>
        </>
      )}

      {openId && <TaskDrawer taskId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
