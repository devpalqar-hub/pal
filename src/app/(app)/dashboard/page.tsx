"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, CalendarOff, PenSquare, UserPlus, BarChart3, CalendarClock, FileCheck2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { IST, istHour, ROLE_LABEL, ROLE_RANK } from "@/lib/client/format";
import { useNotifications } from "@/lib/client/notifications";
import { Loading, useToast } from "@/components/ui";
import { WorkDayCard } from "@/components/work-day-card";
import { OpenTasksCard, RunningTaskBanner } from "@/components/open-tasks-card";
import { MailPanel } from "@/components/mail-panel";
import { TaskDrawer } from "@/components/task-drawer";
import { TaskFormModal } from "@/components/task-form";
import { MeetingsCard, ProjectsHealthCard, RequestsCard, TaskMixCard, TeamTodayCard, WeekCard } from "@/components/dashboard-widgets";
import { fmtH } from "@/components/charts";

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const { requestActions } = useNotifications();
  const isLead = ROLE_RANK[user!.role] >= ROLE_RANK.MANAGER;
  const [d, setD] = useState<any>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [newTask, setNewTask] = useState(false);

  const load = useCallback(async () => {
    const [me, mine, review, projects, team, meetings, reqSummary, incoming] = await Promise.all([
      api("/api/analytics/me"), api("/api/tasks/me"), api("/api/tasks/me?role=reviewer"), api("/api/analytics/projects"),
      isLead ? api("/api/analytics/team") : Promise.resolve(null),
      api("/api/meetings?scope=upcoming"), api("/api/requests/summary"), api("/api/requests?box=incoming"),
    ]);
    setD({ me, tasks: mine.tasks, review: review.tasks.length, projects: projects.projects, team, meetings: meetings.meetings, reqSummary, incoming: incoming.requests, at: Date.now() });
  }, [isLead]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <Loading />;
  const h = istHour();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: IST });
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: IST });
  const meetingsToday = d.meetings.filter((m: any) => m.status === "SCHEDULED" && new Date(m.startsAt).toLocaleDateString("en-CA", { timeZone: IST }) === todayKey).length;
  const { me } = d;
  const projectChoices = d.projects.filter((p: any) => p.status === "ACTIVE" || p.status === "ON_HOLD").map((p: any) => ({ id: p.id, name: p.name }));

  const kpis = [
    { href: "/attendance", value: fmtH(me.today.workedMinutes), label: "Worked today" },
    { href: "/tasks", value: me.tasks.open, label: "Open tasks" },
    { href: "/tasks", value: me.tasks.overdue, label: "Overdue", bad: me.tasks.overdue > 0 },
    { href: "/tasks", value: d.review, label: "To review" },
    { href: "/requests", value: requestActions || d.reqSummary.actionNeeded, label: "Requests to act on", bad: d.reqSummary.needsFix > 0 },
    { href: "/meetings", value: meetingsToday, label: "Meetings today" },
  ];
  const links = [
    { href: "/leave?new=1", icon: CalendarOff, label: "Request leave" },
    { href: "/requests", icon: FileCheck2, label: "New request" },
    { href: "/meetings", icon: CalendarClock, label: "Meeting" },
    { href: "/mail?compose=1", icon: PenSquare, label: "Compose" },
    ...(isLead ? [{ href: "/users?new=1", icon: UserPlus, label: "Add a PAL" }, { href: "/analytics", icon: BarChart3, label: "Analytics" }] : []),
  ];

  return (
    <div className="dash">
      <header className="page-top">
        <div>
          <div className="overline">{dateLabel} · IST</div>
          <h1>{greet}, PAL {user!.name.split(" ")[0]}</h1>
          <p>{user!.designation ? `${user!.designation} · ` : ""}{ROLE_LABEL[user!.role]}{isLead && d.team ? ` · ${d.team.summary.total} PALs in your team` : ""}{me.schedule ? ` · Shift ${me.schedule.startTime}–${me.schedule.endTime}` : ""}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setNewTask(true)}><Plus size={16} /> New task</button>
      </header>

      <nav className="quick-links" aria-label="Quick actions">
        {links.map((l) => <Link key={l.label} href={l.href}><l.icon size={14} /> {l.label}</Link>)}
      </nav>

      <RunningTaskBanner tasks={d.tasks} fetchedAt={d.at} onOpen={setOpenId} onChanged={load} />

      <section className="kpi-strip">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="kpi-cell">
            <span className="kpi-cap">{k.label}</span>
            <span className={`kpi-num${k.bad ? " bad" : ""}`}>{k.value}</span>
          </Link>
        ))}
      </section>

      <div className="dash-row r-4-4-4">
        <WorkDayCard requiredMinutes={me.requiredMinutes} schedule={me.schedule} onChange={load} />
        <WeekCard week={me.week} target={me.requiredMinutes} />
        <TaskMixCard counts={me.tasks.byStatus} overdue={me.tasks.overdue} completedThisWeek={me.tasks.completedThisWeek} />
      </div>

      {isLead && d.team && (
        <div className="dash-row r-7-5">
          <TeamTodayCard team={d.team} />
          <ProjectsHealthCard projects={d.projects} />
        </div>
      )}

      <div className="dash-row r-7-5">
        <OpenTasksCard tasks={d.tasks} fetchedAt={d.at} onOpen={setOpenId} onChanged={load} />
        <MailPanel />
      </div>

      <div className={`dash-row ${isLead ? "r-2" : "r-4-4-4"}`}>
        <MeetingsCard meetings={d.meetings} now={d.at} />
        <RequestsCard requests={d.incoming} summary={d.reqSummary} />
        {!isLead && <ProjectsHealthCard projects={d.projects} title="My projects" />}
      </div>

      {openId && <TaskDrawer taskId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
      {newTask && <TaskFormModal projects={projectChoices} onClose={() => setNewTask(false)} onCreated={() => { setNewTask(false); toast("Task created"); load(); }} />}
    </div>
  );
}
