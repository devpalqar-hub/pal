"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Mail, PenSquare, RefreshCw, Search, Reply, ArrowLeft } from "lucide-react";
import { api } from "@/lib/client/api";
import { useMail, type MailSummary } from "@/lib/client/mail";
import { fmtMailDate, fmtTime } from "@/lib/client/format";
import { Loading, Spinner, useToast } from "@/components/ui";
import { ComposeModal, MessageBody, replySubject, useMessage } from "@/components/mail-parts";

const PAGE = 25;

export default function MailPage() {
  const mail = useMail();
  const toast = useToast();
  const [uid, setUid] = useState<number | null>(null);
  const [older, setOlder] = useState<MailSummary[]>([]);
  const [hasMore, setHasMore] = useState<boolean | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [compose, setCompose] = useState<null | { to?: string; subject?: string }>(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("compose") === "1" ? {} : null));
  const m = useMessage(uid);

  const all = useMemo(() => {
    const seen = new Set<number>();
    return [...mail.messages, ...older].filter((x) => !seen.has(x.uid) && seen.add(x.uid));
  }, [mail.messages, older]);
  const shown = all.filter((x) => (!unreadOnly || !mail.isSeen(x) || x.uid === uid) && (!q || `${x.from.name} ${x.from.address} ${x.subject}`.toLowerCase().includes(q.toLowerCase())));
  const canLoadMore = hasMore ?? mail.messages.length >= PAGE;

  async function loadMore() {
    const last = all[all.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const r = await api<{ messages: MailSummary[] }>(`/api/mail/inbox?limit=${PAGE}&before=${last.uid}`);
      setOlder((o) => [...o, ...r.messages]);
      setHasMore(r.messages.length >= PAGE);
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", true); }
    finally { setLoadingMore(false); }
  }

  if (mail.configured === false) {
    return (
      <div className="card card-pad" style={{ maxWidth: 480 }}>
        <h3>Set up your mailbox</h3>
        <p className="hint" style={{ margin: "6px 0 14px" }}>No company mailbox is linked to your account yet.</p>
        <MailboxLink />
      </div>
    );
  }
  if (mail.configured === null) return <Loading />;

  return (
    <div className={`mail-layout${uid ? " reading" : ""}`}>
      <section className="card mail-list">
        <div className="card-head tight">
          <h3><Mail size={16} /> Inbox {mail.unseen > 0 && <span className="badge b-red">{mail.unseen}</span>}</h3>
          <div className="actions">
            <button className="btn btn-ghost btn-sm" onClick={mail.refresh} title="Refresh"><RefreshCw size={14} className={mail.loading ? "spin" : ""} /></button>
            <button className="btn btn-primary btn-sm" onClick={() => setCompose({})}><PenSquare size={14} /> Compose</button>
          </div>
        </div>
        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
          <div className="input-wrap"><Search size={15} style={{ top: 11 }} /><input className="input" style={{ height: 34 }} placeholder="Search loaded mail…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <div style={{ padding: "8px 12px 0" }}>
          <div className="seg full">
            <button className={!unreadOnly ? "on" : ""} onClick={() => setUnreadOnly(false)}>All</button>
            <button className={unreadOnly ? "on" : ""} onClick={() => setUnreadOnly(true)}>Unread{mail.unseen > 0 ? ` (${mail.unseen})` : ""}</button>
          </div>
        </div>
        {mail.error && <div className="alert alert-error" style={{ margin: 12 }}>{mail.error}</div>}
        <div className="list grow-scroll">
          {shown.length === 0 && <div className="empty tight">{unreadOnly ? "No unread messages" : "No messages"}</div>}
          {shown.map((x) => (
            <div key={x.uid} className={`list-row mail${mail.isSeen(x) ? "" : " unread"}${uid === x.uid ? " active" : ""}`} onClick={() => setUid(x.uid)}>
              <div className="grow-min">
                <div className="title-line"><span className="t">{x.from.name || x.from.address || "Unknown"}</span></div>
                <div className="sub-line"><span className="ellipsis">{x.subject}</span></div>
              </div>
              <span className="hint nowrap">{fmtMailDate(x.date)}</span>
            </div>
          ))}
          {canLoadMore && !q && !unreadOnly && <div style={{ padding: 10, textAlign: "center" }}><button className="btn btn-sm" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <Spinner /> : "Load older"}</button></div>}
        </div>
        <div className="foot-note">{mail.lastChecked ? `Checked ${fmtTime(mail.lastChecked.toISOString())} IST · auto-checks every 2 min` : "Checking…"}</div>
      </section>

      <section className="card mail-read">
        {!uid ? (
          <div className="empty"><Mail size={36} />Select a message to read it</div>
        ) : !m ? <Loading /> : (
          <>
            <div className="card-head">
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <button className="btn btn-ghost btn-sm back-only" onClick={() => setUid(null)}><ArrowLeft size={16} /></button>
                <h3 className="ellipsis">{m.subject}</h3>
              </div>
              <button className="btn btn-sm" onClick={() => setCompose({ to: m.from.address, subject: replySubject(m.subject) })}><Reply size={14} /> Reply</button>
            </div>
            <div className="card-pad" style={{ overflow: "auto" }}><MessageBody m={m} frameHeight="calc(100vh - 430px)" /></div>
          </>
        )}
      </section>

      {compose && <ComposeModal initial={compose} onClose={() => setCompose(null)} />}
    </div>
  );
}

function MailboxLink() {
  return <Link href="/dashboard" className="btn btn-primary btn-sm">Go to dashboard</Link>;
}
