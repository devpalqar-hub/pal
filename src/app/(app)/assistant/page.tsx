"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, Send, Play, CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/client/api";
import { useAuth } from "@/lib/client/auth";
import { PageHeader, PriorityBadge, Spinner, useToast } from "@/components/ui";

type Turn = { role: "user" | "assistant"; content: string; plan?: any; trace?: string[]; results?: { ok: boolean; label: string; error?: string; taskId?: number }[] };

export default function Assistant() {
  const { user } = useAuth();
  const toast = useToast();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<Record<number, string>>({});
  const [projects, setProjects] = useState<Record<number, string>>({});
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api("/api/directory").then((r) => setNames(Object.fromEntries([[user!.id, `${user!.name} (you)`], ...r.users.map((u: any) => [u.id, u.name])]))).catch(() => {});
    api("/api/projects").then((r) => setProjects(Object.fromEntries(r.projects.map((p: any) => [p.id, p.name])))).catch(() => {});
  }, [user]);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [turns, busy]);

  async function send() {
    const content = text.trim();
    if (!content || busy) return;
    const next: Turn[] = [...turns, { role: "user", content }];
    setTurns(next); setText(""); setBusy(true);
    try {
      const r = await api("/api/agent/chat", { body: { messages: next.map((t) => ({ role: t.role, content: t.content })).slice(-20) } });
      setTurns([...next, { role: "assistant", content: r.reply, plan: r.plan, trace: r.trace }]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", true);
      setTurns(next);
    } finally { setBusy(false); }
  }

  async function execute(i: number) {
    setBusy(true);
    try {
      const r = await api("/api/agent/execute", { body: { actions: turns[i].plan.actions } });
      setTurns((ts) => ts.map((t, j) => (j === i ? { ...t, results: r.results, plan: { ...t.plan, done: true } } : t)));
      const failed = r.results.filter((x: any) => !x.ok).length;
      toast(failed ? `${failed} step(s) failed` : "Plan executed", !!failed);
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
    finally { setBusy(false); }
  }

  const who = (ids?: number[]) => (ids?.length ? ids.map((i) => names[i] ?? `#${i}`).join(", ") : "Unassigned");
  const meta = (t: any) => (
    <span className="hint"> {t.priority && <PriorityBadge priority={t.priority} />} {t.dueDate && <>· due {t.dueDate} </>}{t.estimatedMinutes && <>· {t.estimatedMinutes}m </>}· {who(t.assigneeIds)}</span>
  );

  return (
    <>
      <PageHeader title="AI assistant" subtitle="Describe a goal — it plans the tasks, picks assignees, and runs the plan once you approve." />
      <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 420 }}>
        {turns.length === 0 && (
          <div className="empty"><Sparkles size={26} />Try: “Plan the launch of the new landing page in project Website and split it across the team, due next Friday.”</div>
        )}
        {turns.map((t, i) => (
          <div key={i} style={{ alignSelf: t.role === "user" ? "flex-end" : "stretch", maxWidth: t.role === "user" ? "80%" : "100%" }}>
            {t.role === "user" ? (
              <div className="badge b-purple" style={{ whiteSpace: "normal", padding: "8px 12px", fontSize: 14 }}>{t.content}</div>
            ) : (
              <div className="card compact">
                {t.trace && t.trace.length > 0 && <div className="hint" style={{ marginBottom: 6 }}>{[...new Set(t.trace)].join(" · ")}</div>}
                <div style={{ whiteSpace: "pre-wrap" }}>{t.content}</div>
                {t.plan && (
                  <div style={{ marginTop: 10 }}>
                    <div className="list">
                      {t.plan.actions.map((a: any, k: number) => (
                        <div key={k} className="list-row" style={{ cursor: "default" }}>
                          <div className="grow-min">
                            {a.type === "create_task" && <>
                              <div className="title-line"><span className="t">New task: {a.title}</span></div>
                              <div className="sub-line" style={{ whiteSpace: "normal" }}>{projects[a.projectId] ?? `Project #${a.projectId}`}{meta(a)}</div>
                              {a.description && <div className="hint" style={{ whiteSpace: "pre-wrap" }}>{a.description}</div>}
                              {a.subtasks?.map((s: any, n: number) => <div key={n} className="sub-line" style={{ whiteSpace: "normal", paddingLeft: 14 }}>↳ {s.title}{meta(s)}</div>)}
                            </>}
                            {a.type === "assign_task" && <div className="title-line"><span className="t">Add {who(a.addAssigneeIds)} to task #{a.taskId}</span></div>}
                            {a.type === "add_comment" && <div className="title-line"><span className="t">Comment on task #{a.taskId}: “{a.text}”</span></div>}
                            {a.type === "start_task" && <div className="title-line"><span className="t">Start your timer on task #{a.taskId}</span></div>}
                          </div>
                        </div>
                      ))}
                    </div>
                    {!t.plan.done && (
                      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
                        <button className="btn btn-primary" disabled={busy} onClick={() => execute(i)}><Play size={15} /> Approve &amp; execute</button>
                        <span className="hint">Assignees get notified. Or reply below to adjust the plan.</span>
                      </div>
                    )}
                  </div>
                )}
                {t.results && (
                  <div className="list" style={{ marginTop: 10 }}>
                    {t.results.map((r, k) => (
                      <div key={k} className="list-row" style={{ cursor: "default" }}>
                        {r.ok ? <CheckCircle2 size={16} color="#16a34a" /> : <XCircle size={16} color="#dc2626" />}
                        <div className="grow-min"><span className="t">{r.label}</span>{r.error && <div className="hint">{r.error}</div>}</div>
                        {r.taskId && r.ok && <Link href={`/tasks?open=${r.taskId}`} className="btn btn-ghost btn-sm">Open</Link>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="hint"><Spinner /> Working…</div>}
        <div ref={end} />
      </div>
      <form style={{ display: "flex", gap: 8, marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input className="input" style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="What do you need done?" maxLength={4000} />
        <button className="btn btn-primary" disabled={busy || !text.trim()}><Send size={15} /> Send</button>
      </form>
    </>
  );
}
