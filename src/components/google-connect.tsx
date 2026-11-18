"use client";

import { useEffect, useState } from "react";
import { CalendarCheck2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { useToast } from "./ui";

/** Connect / disconnect the caller's Google Calendar. Shows nothing when the server has no Google OAuth client set up. */
export function GoogleConnect({ compact }: { compact?: boolean }) {
  const toast = useToast();
  const [s, setS] = useState<{ configured: boolean; connected: boolean; email: string | null } | null>(null);
  const load = () => api("/api/integrations/google").then(setS).catch(() => {});
  useEffect(() => {
    load();
    const q = new URLSearchParams(window.location.search).get("google");
    if (q) {
      toast(q === "connected" ? "Google Calendar connected — new meetings will be added to it" : q === "denied" ? "Google access was not granted" : "Could not connect Google Calendar", q !== "connected");
      const u = new URL(window.location.href);
      u.searchParams.delete("google");
      window.history.replaceState(null, "", u.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!s?.configured) return null;
  if (s.connected) {
    return (
      <button className="btn" title={`Connected as ${s.email} — click to disconnect`} onClick={async () => {
        if (!confirm(`Disconnect Google Calendar (${s.email})? Existing events stay in your calendar.`)) return;
        await api("/api/integrations/google", { method: "DELETE" }); toast("Google Calendar disconnected"); load();
      }}><CalendarCheck2 size={16} color="var(--success)" /> {compact ? "Google" : `Google Calendar · ${s.email}`}</button>
    );
  }
  return <button className="btn" onClick={async () => { try { const r = await api("/api/integrations/google/connect", { method: "POST" }); window.location.href = r.url; } catch (e) { toast(e instanceof Error ? e.message : "Failed", true); } }}><CalendarCheck2 size={16} /> Connect Google Calendar</button>;
}

/** Shared hook: is the caller's Google Calendar connected? */
export function useGoogleStatus() {
  const [s, setS] = useState<{ configured: boolean; connected: boolean; email: string | null } | null>(null);
  useEffect(() => { api("/api/integrations/google").then(setS).catch(() => setS(null)); }, []);
  return s;
}
