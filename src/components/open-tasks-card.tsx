"use client";

import { memo, useEffect, useState } from "react";
import Link from "next/link";
import { Play, Pause, Inbox } from "lucide-react";
import { api } from "@/lib/client/api";
import { fmtDuration } from "@/lib/client/format";
import { useNotifications } from "@/lib/client/notifications";
import { PriorityBadge, useToast } from "./ui";

function Live({ task, base }: { task: any; base: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!task.isTimerRunning) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [task.isTimerRunning]);
  const extra = task.isTimerRunning ? Math.max(0, now - base) / 1000 : 0;
  return <span className="mono">{fmtDuration(task.workedSeconds + extra, true)}</span>;
}

/** Open tasks with inline Start / Pause. Click a row for the full task panel. */
function OpenTasksCardImpl({ tasks, fetchedAt, onOpen, onChanged }: { tasks: any[]; fetchedAt: number; onOpen: (id: number) => void; onChanged: () => void }) {
  const toast = useToast();
  const { unreadTaskIds } = useNotifications();
  const [busyId, setBusyId] = useState<number | null>(null);
  const open = tasks
    .filter((t) => ["TODO", "IN_PROGRESS", "PAUSED"].includes(t.status))
    .sort((a, b) => Number(b.isTimerRunning) - Number(a.isTimerRunning) || +new Date(b.createdAt) - +new Date(a.createdAt));

  async function act(e: React.MouseEvent, t: any, action: "start" | "pause") {
    e.stopPropagation();
    setBusyId(t.id);
    try { await api(`/api/tasks/${t.id}/${action}`, { method: "POST" }); onChanged(); }
    catch (err) { toast(err instanceof Error ? err.message : "Failed", true); }
    finally { setBusyId(null); }
  }

  return (
    <div className="card">
      <div className="card-head tight"><h3>Open tasks <span className="count">{open.length}</span></h3><Link href="/tasks" className="btn btn-ghost btn-sm">All tasks</Link></div>
      {open.length === 0 ? (
        <div className="empty tight"><Inbox size={26} />You’re all caught up</div>
      ) : (
        <div className="list scroll">
          {open.map((t) => {
            const isNew = t.status === "TODO" && fetchedAt - +new Date(t.createdAt) < 24 * 3600 * 1000;
            return (
              <div key={t.id} className="list-row" onClick={() => onOpen(t.id)}>
                <div className="grow-min">
                  <div className="title-line">
                    {t.isTimerRunning && <span className="timer-dot" />}
                    <span className="t">{t.title}</span>
                    {(isNew || unreadTaskIds.has(t.id)) && <span className="badge b-purple">New</span>}
                  </div>
                  <div className="sub-line">{t.project.name} · <PriorityBadge priority={t.priority} /> · <Live task={t} base={fetchedAt} /></div>
                </div>
                {t.status === "IN_PROGRESS" ? (
                  <button className="btn btn-sm" disabled={busyId === t.id} onClick={(e) => act(e, t, "pause")}><Pause size={14} /> Pause</button>
                ) : (
                  <button className="btn btn-primary btn-sm" disabled={busyId === t.id} onClick={(e) => act(e, t, "start")}><Play size={14} /> {t.status === "PAUSED" ? "Resume" : "Start"}</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
export const OpenTasksCard = memo(OpenTasksCardImpl);
