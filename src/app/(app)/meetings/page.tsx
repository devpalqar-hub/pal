"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Video, MapPin } from "lucide-react";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { fmtDayHeading } from "@/lib/client/format";
import { Avatar, Empty, Loading, PageHeader } from "@/components/ui";
import { GoogleConnect } from "@/components/google-connect";
import { MeetingDrawer, MeetingFormModal, RSVP_TONE, meetingPhase, timeRange } from "@/components/meeting-parts";

export default function MeetingsPage() {
  const { user } = useAuth();
  const params = useSearchParams();
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const [rows, setRows] = useState<any[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [openId, setOpenId] = useState<number | null>(Number(params.get("open")) || null);
  useEffect(() => { const id = Number(params.get("open")) || null; if (id) setOpenId(id); }, [params]);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => api(`/api/meetings?scope=${scope}`).then((r) => setRows(r.meetings)), [scope]);
  useEffect(() => { setRows(null); load(); }, [load]);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(i); }, []);

  const groups = useMemo(() => {
    const g = new Map<string, any[]>();
    (rows ?? []).forEach((m) => { const k = fmtDayHeading(m.startsAt); g.set(k, [...(g.get(k) ?? []), m]); });
    return [...g.entries()];
  }, [rows]);

  return (
    <>
      <PageHeader title="Meetings" subtitle="Schedule meetings, share the agenda and link, and invite your team (times in IST)."
        actions={<><GoogleConnect /><button className="btn btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> Schedule meeting</button></>} />
      <div className="tabs">
        <button className={`tab${scope === "upcoming" ? " active" : ""}`} onClick={() => setScope("upcoming")}>Upcoming</button>
        <button className={`tab${scope === "past" ? " active" : ""}`} onClick={() => setScope("past")}>Past</button>
      </div>

      {!rows ? <Loading /> : groups.length === 0 ? <div className="card"><Empty title={scope === "upcoming" ? "No upcoming meetings" : "No past meetings"}>{scope === "upcoming" && "Use “Schedule meeting” to set one up."}</Empty></div> : groups.map(([day, list]) => (
        <section key={day} style={{ marginBottom: 20 }}>
          <h4 className="day-head">{day}</h4>
          <div className="card">
            {list.map((m) => {
              const phase = meetingPhase(m, now);
              const mine = m.attendees.find((a: any) => a.userId === user!.id);
              const [rcls, rlbl] = mine ? RSVP_TONE[mine.response] : ["b-purple", "Organiser"];
              return (
                <div key={m.id} className={`list-row meet${m.status === "CANCELLED" ? " cancelled" : ""}`} onClick={() => setOpenId(m.id)}>
                  <div className="meet-time"><b>{timeRange(m).split(" – ")[0]}</b><span>{timeRange(m).split(" – ")[1]}</span></div>
                  <div className="grow-min">
                    <div className="title-line"><span className="t">{m.title}</span>
                      {phase === "live" && <span className="badge b-green"><span className="timer-dot" /> Live</span>}
                      {phase === "soon" && <span className="badge b-amber">Soon</span>}
                      {m.status === "CANCELLED" && <span className="badge b-red">Cancelled</span>}
                      {m.project && <span className="badge b-purple">{m.project.name}</span>}</div>
                    <div className="sub-line">{m.organizerId === user!.id ? "You" : m.organizer.name} · {m.attendees.length + 1 + (m.guests?.length ?? 0)} people{m.lead ? ` · lead: ${m.lead.name}` : ""}{m.location ? <> · <MapPin size={11} /> {m.location}</> : null}</div>
                  </div>
                  <div className="avatar-stack">{m.attendees.slice(0, 4).map((a: any) => <Avatar key={a.id} name={a.user.name} small />)}</div>
                  <span className={`badge ${rcls}`}>{rlbl}</span>
                  {m.link && m.status !== "CANCELLED" && phase !== "past" && <a className={`btn btn-sm ${phase === "live" || phase === "soon" ? "btn-primary" : ""}`} href={m.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><Video size={14} /> Join</a>}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {newOpen && <MeetingFormModal onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); load(); }} />}
      {openId && <MeetingDrawer meetingId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}
