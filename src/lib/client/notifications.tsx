"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlarmClock, PhoneCall, Target, Bell, CalendarClock, CalendarOff, CheckCircle2, ClipboardCheck, Eye, Flag, FileCheck2, FileX2, FilePlus2, Pin, ThumbsUp, Undo2, Ban, MessageSquare, type LucideIcon } from "lucide-react";
import { api } from "./api";
import { desktopNotify } from "./desktop-notify";
import { useToast } from "@/components/ui";

export const NOTIFY_POLL_MS = 60 * 1000;

export interface Notice {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  taskId: number | null;
  readAt: string | null;
  createdAt: string;
}

interface Ctx {
  unread: number;
  latest: Notice[];
  /** task ids that have unread notifications (for "New" markers) */
  unreadTaskIds: Set<number>;
  /** requests that need my action (to approve, to fix, to complete) */
  requestActions: number;
  refresh: () => Promise<void>;
  markRead: (opts: { ids?: number[]; taskId?: number; all?: boolean }) => Promise<void>;
}

const C = createContext<Ctx | null>(null);

/** Polls in the browser every minute while the tab is visible; alerts on new items. */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [unread, setUnread] = useState(0);
  const [latest, setLatest] = useState<Notice[]>([]);
  const [requestActions, setRequestActions] = useState(0);
  const lastId = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [r, rq] = await Promise.all([api<{ notifications: Notice[]; unread: number }>("/api/notifications?limit=20"), api<{ actionNeeded: number }>("/api/requests/summary").catch(() => ({ actionNeeded: 0 }))]);
      setRequestActions(rq.actionNeeded);
      const newest = r.notifications[0]?.id ?? 0;
      if (lastId.current !== null && newest > lastId.current) {
        const fresh = r.notifications.filter((n) => n.id > lastId.current! && !n.readAt);
        if (fresh.length) {
          toast(fresh.length === 1 ? fresh[0].title : `${fresh.length} new notifications`);
          desktopNotify(fresh[0].title, fresh[0].body ?? "", fresh[0].link ?? "/notifications");
        }
      }
      lastId.current = newest;
      setLatest(r.notifications);
      setUnread(r.unread);
    } catch { /* transient errors are retried on the next poll */ }
  }, [toast]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => document.visibilityState === "visible" && refresh(), NOTIFY_POLL_MS);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [refresh]);

  const markRead = useCallback(async (opts: { ids?: number[]; taskId?: number; all?: boolean }) => {
    const r = await api<{ unread: number }>("/api/notifications/read", { body: opts });
    setUnread(r.unread);
    const now = new Date().toISOString();
    setLatest((l) => l.map((n) => (opts.all || opts.ids?.includes(n.id) || (opts.taskId && n.taskId === opts.taskId) ? { ...n, readAt: n.readAt ?? now } : n)));
  }, []);

  const unreadTaskIds = new Set(latest.filter((n) => !n.readAt && n.taskId).map((n) => n.taskId!));
  return <C.Provider value={{ unread, latest, unreadTaskIds, requestActions, refresh, markRead }}>{children}</C.Provider>;
}

export function useNotifications() {
  const c = useContext(C);
  if (!c) throw new Error("useNotifications outside NotificationProvider");
  return c;
}

export const NOTICE_ICON: Record<string, LucideIcon> = {
  TASK_ASSIGNED: Pin, TASK_REVIEW_REQUESTED: Eye, TASK_COMPLETED: CheckCircle2, TASK_APPROVED: ThumbsUp, TASK_REJECTED: Undo2, TASK_ENDED: Flag, TASK_DECLINED: Ban, TASK_COMMENT: MessageSquare,
  REQUEST_RECEIVED: FilePlus2, REQUEST_REJECTED: FileX2, REQUEST_RESUBMITTED: ClipboardCheck, REQUEST_APPROVED: FileCheck2, REQUEST_COMPLETED: FileCheck2,
  MEETING_INVITE: CalendarClock, MEETING_UPDATED: CalendarClock, MEETING_CANCELLED: CalendarClock, MEETING_REMINDER: AlarmClock, LEAVE_DECIDED: CalendarOff,
  LEAD_ASSIGNED: Target, LEAD_FOLLOW_UP_ASSIGNED: PhoneCall, LEAD_FOLLOW_UP_DUE: AlarmClock,
};
export const noticeIcon = (type: string): LucideIcon => NOTICE_ICON[type] ?? Bell;
