"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "./api";
import { useToast } from "@/components/ui";
import { desktopNotify } from "./desktop-notify";

export const MAIL_POLL_MS = 2 * 60 * 1000; // check for new mail every 2 minutes

export interface MailSummary {
  uid: number;
  from: { name: string; address: string };
  subject: string;
  date: string | null;
  seen: boolean;
}

interface MailCtx {
  /** null = unknown yet, false = no mailbox set up */
  configured: boolean | null;
  messages: MailSummary[];
  unseen: number;
  loading: boolean;
  error: string | null;
  lastChecked: Date | null;
  refresh: () => Promise<void>;
  /** Call after opening a message. Only lowers the unread count if it really was unread. */
  markRead: (uid: number, wasSeen: boolean) => void;
  isSeen: (m: MailSummary) => boolean;
  recheckConfig: () => void;
}

const Ctx = createContext<MailCtx | null>(null);

/**
 * Polls the mailbox from the user's browser every 2 minutes while the site is open
 * (nothing runs on the server in between). Pauses while the tab is hidden and
 * catches up as soon as the tab is visible again.
 */
export function MailProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<MailSummary[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const known = useRef<Set<number> | null>(null);
  const inflight = useRef(false);
  const stopped = useRef(false);
  const [readLocally, setReadLocally] = useState<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    if (inflight.current || stopped.current) return;
    inflight.current = true;
    setLoading(true);
    try {
      const r = await api<{ messages: MailSummary[]; unseen: number }>("/api/mail/inbox?limit=25");
      setConfigured(true);
      setError(null);
      if (known.current) {
        const fresh = r.messages.filter((m) => !known.current!.has(m.uid) && !m.seen);
        if (fresh.length) {
          const text = fresh.length === 1 ? `New email from ${fresh[0].from.name || fresh[0].from.address}` : `${fresh.length} new emails`;
          toast(text);
          desktopNotify("New email", fresh.length === 1 ? `${text}: ${fresh[0].subject}` : text, "/mail");
        }
      }
      known.current = new Set(r.messages.map((m) => m.uid));
      setMessages(r.messages);
      setUnseen(r.unseen);
      setReadLocally(new Set()); // the server is the source of truth again
      setLastChecked(new Date());
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConfigured(false);
        stopped.current = true; // nothing to poll until a mailbox is configured
      } else {
        setError(e instanceof Error ? e.message : "Mail check failed");
      }
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, MAIL_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible" && lastChecked && Date.now() - lastChecked.getTime() > MAIL_POLL_MS) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const markRead = useCallback((uid: number, wasSeen: boolean) => {
    setReadLocally((prev) => {
      if (prev.has(uid)) return prev;
      return new Set(prev).add(uid);
    });
    // Only an unread message lowers the count; re-opening a read one must not.
    if (!wasSeen) setUnseen((n) => Math.max(0, n - 1));
  }, []);
  const isSeen = useCallback((m: MailSummary) => m.seen || readLocally.has(m.uid), [readLocally]);

  const recheckConfig = useCallback(() => {
    stopped.current = false;
    known.current = null;
    setConfigured(null);
    refresh();
  }, [refresh]);

  return (
    <Ctx.Provider value={{ configured, messages, unseen, loading, error, lastChecked, refresh, markRead, isSeen, recheckConfig }}>
      {children}
    </Ctx.Provider>
  );
}

export function useMail() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMail outside MailProvider");
  return c;
}
