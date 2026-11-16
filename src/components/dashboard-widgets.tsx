"use client";

import Link from "next/link";
import { ArrowRight, Users, AlertTriangle } from "lucide-react";
import { DAY_NAMES, fmtDate } from "@/lib/client/format";
import { Avatar } from "./ui";
import { Bar, Donut, PRESENCE_COLORS, PRESENCE_LABELS, StackBar, TASK_COLORS, TASK_LABELS, WeekBars, fmtH, taskBuckets } from "./charts";

export function WeekCard({ week, target }: { week: any[]; target: number }) {
  const total = week.reduce((n, d) => n + d.workedMinutes, 0);
  const present = week.filter((d) => d.status === "PRESENT" || d.status === "HALF_DAY").length;
  return (
    <div className="card dash-card">
      <div className="dc-head"><h3>This week</h3><span className="hint">{fmtH(total)} · {present} day(s) present</span></div>
      <WeekBars target={target} days={week.map((d, i) => {
        const dt = new Date(d.date + "T00:00:00Z");
        return { label: i === week.length - 1 ? "Today" : DAY_NAMES[dt.getUTCDay()], sub: fmtDate(d.date), minutes: d.workedMinutes, muted: !d.isWorkingDay, highlight: i === week.length - 1 };
      })} />
    </div>
  );
}

export function TaskMixCard({ counts, overdue, completedThisWeek }: { counts: Record<string, number>; overdue: number; completedThisWeek: number }) {
  const segs = taskBuckets(counts).map((b) => ({ ...b, color: TASK_COLORS[b.key], label: TASK_LABELS[b.key] }));
  return (
    <div className="card dash-card">
      <div className="dc-head"><h3>My tasks</h3><Link href="/tasks" className="link-sm">Open <ArrowRight size={13} /></Link></div>
      <Donut segments={segs} size={112} stroke={14} />
      <div className="mini-stats">
        <span><b>{completedThisWeek}</b> done this week</span>
        <span className={overdue ? "danger" : ""}>{overdue > 0 && <AlertTriangle size={13} />}<b>{overdue}</b> overdue</span>
      </div>
    </div>
  );
}

const ORDER = ["WORKING", "PAUSED", "STOPPED", "ON_LEAVE", "NOT_STARTED"];

export function TeamTodayCard({ team }: { team: any }) {
  const s = team.summary;
  const segs = [
    { key: "WORKING", value: s.working }, { key: "PAUSED", value: s.onBreak }, { key: "STOPPED", value: s.checkedOut },
    { key: "ON_LEAVE", value: s.onLeave }, { key: "NOT_STARTED", value: s.notCheckedIn },
  ].map((x) => ({ ...x, color: PRESENCE_COLORS[x.key], label: PRESENCE_LABELS[x.key] }));
  const rows = [...team.members].sort((a, b) => ORDER.indexOf(a.today.status) - ORDER.indexOf(b.today.status) || b.today.workedMinutes - a.today.workedMinutes).slice(0, 6);
  return (
    <div className="card dash-card">
      <div className="dc-head">
        <h3><Users size={15} /> My PALs today <span className="count">{s.total}</span></h3>
        <Link href="/analytics" className="link-sm">Team analytics <ArrowRight size={13} /></Link>
      </div>
      {s.total === 0 ? <p className="hint">No PALs report to you yet.</p> : (
        <>
          <StackBar segments={segs} />
          {s.late > 0 && <p className="hint" style={{ marginTop: 8, color: "var(--danger)" }}><AlertTriangle size={13} style={{ verticalAlign: -2 }} /> {s.late} PAL(s) checked in late today</p>}
          <div className="pal-list">
            {rows.map((m) => (
              <Link key={m.id} href={`/users/${m.id}?tab=analytics`} className="pal-row">
                <span className="presence-dot" style={{ background: PRESENCE_COLORS[m.today.status] }} title={PRESENCE_LABELS[m.today.status]} />
                <Avatar name={m.name} small />
                <span className="grow-min"><span className="t">{m.name}</span><span className="sub">{PRESENCE_LABELS[m.today.status]}{m.today.isLate ? " · late" : ""}</span></span>
                <span className="pal-metric">{fmtH(m.today.workedMinutes)}</span>
                <span className={`pal-metric${m.overdueTasks ? " danger" : ""}`} title="Open / overdue tasks">{m.openTasks}{m.overdueTasks > 0 && ` · ${m.overdueTasks}!`}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export const HEALTH: Record<string, [string, string]> = {
  ON_TRACK: ["On track", "b-green"], AT_RISK: ["At risk", "b-amber"], OFF_TRACK: ["Off track", "b-red"], DONE: ["Done", "b-blue"],
};

export function ProjectsHealthCard({ projects, title = "Projects" }: { projects: any[]; title?: string }) {
  const rank = { OFF_TRACK: 0, AT_RISK: 1, ON_TRACK: 2, DONE: 3 } as Record<string, number>;
  const rows = [...projects].sort((a, b) => rank[a.health] - rank[b.health]).slice(0, 5);
  return (
    <div className="card dash-card">
      <div className="dc-head"><h3>{title} <span className="count">{projects.length}</span></h3><Link href="/analytics?tab=projects" className="link-sm">All <ArrowRight size={13} /></Link></div>
      {rows.length === 0 ? <p className="hint">No active projects.</p> : rows.map((p) => {
        const [hl, tone] = HEALTH[p.health];
        return (
          <Link key={p.id} href={`/projects/${p.id}`} className="proj-row">
            <div className="proj-top"><span className="t">{p.name}</span><span className={`badge ${tone}`}>{hl}</span></div>
            <div className="proj-bar"><Bar value={p.progress} color={p.health === "OFF_TRACK" ? "#ef4444" : p.health === "AT_RISK" ? "#f59e0b" : undefined} /><span>{p.progress}%</span></div>
            <div className="sub">{p.totalTasks} tasks{p.overdueTasks ? ` · ${p.overdueTasks} overdue` : ""} · {fmtH(p.loggedMinutes)} logged{p.daysLeft !== null ? ` · ${p.daysLeft < 0 ? `${-p.daysLeft}d late` : `${p.daysLeft}d left`}` : ""}</div>
          </Link>
        );
      })}
    </div>
  );
}

/* ── Meetings & requests panels ── */
import { CalendarClock, FileCheck2, Video } from "lucide-react";
import { fmtDayHeading, fmtMailDate } from "@/lib/client/format";
import { REQUEST_TYPE_MAP } from "@/lib/request-types";
import { RequestStatus } from "./request-parts";
import { meetingPhase, timeRange } from "./meeting-parts";

export function MeetingsCard({ meetings, now }: { meetings: any[]; now: number }) {
  const live = meetings.filter((m) => m.status === "SCHEDULED").slice(0, 4);
  return (
    <div className="card dash-card">
      <div className="dc-head"><h3><CalendarClock size={15} /> Meetings <span className="count">{live.length}</span></h3><Link href="/meetings" className="link-sm">Schedule <ArrowRight size={13} /></Link></div>
      {live.length === 0 ? <p className="hint">Nothing scheduled. Plan one from the Meetings page.</p> : live.map((m) => {
        const ph = meetingPhase(m, now);
        return (
          <Link key={m.id} href={`/meetings?open=${m.id}`} className="pal-row">
            <span className="meet-time" style={{ width: 54 }}><b style={{ fontSize: 12 }}>{timeRange(m).split(" – ")[0]}</b><span>{fmtDayHeading(m.startsAt).split(",")[0].slice(0, 3)}</span></span>
            <span className="grow-min"><span className="t">{m.title}</span><span className="sub">{m.attendees.length + 1} people{m.project ? ` · ${m.project.name}` : ""}</span></span>
            {ph === "live" && <span className="badge b-green"><span className="timer-dot" /> Live</span>}
            {ph === "soon" && <span className="badge b-amber">Soon</span>}
            {m.link && (ph === "live" || ph === "soon") && <a className="btn btn-primary btn-sm" href={m.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><Video size={13} /> Join</a>}
          </Link>
        );
      })}
    </div>
  );
}

export function RequestsCard({ requests, summary }: { requests: any[]; summary: { awaitingMe: number; needsFix: number; approvedForMe: number } }) {
  const todo = requests.filter((r) => ["PENDING", "RESUBMITTED", "APPROVED"].includes(r.status)).slice(0, 4);
  return (
    <div className="card dash-card">
      <div className="dc-head"><h3><FileCheck2 size={15} /> Requests <span className="count">{summary.awaitingMe + summary.approvedForMe + summary.needsFix}</span></h3><Link href="/requests" className="link-sm">Open <ArrowRight size={13} /></Link></div>
      {summary.needsFix > 0 && <p className="hint" style={{ color: "var(--danger)", marginBottom: 6 }}><AlertTriangle size={13} style={{ verticalAlign: -2 }} /> {summary.needsFix} of your request(s) were rejected — edit and resubmit.</p>}
      {todo.length === 0 ? <p className="hint">No requests are waiting on you.</p> : todo.map((r) => (
        <Link key={r.id} href={`/requests?open=${r.id}`} className="pal-row">
          <span className="grow-min"><span className="t">{r.title}</span><span className="sub">{REQUEST_TYPE_MAP[r.type]?.label} · from {r.requester.name} · {fmtMailDate(r.updatedAt)}</span></span>
          <RequestStatus status={r.status} />
        </Link>
      ))}
    </div>
  );
}
