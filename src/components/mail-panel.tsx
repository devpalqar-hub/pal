"use client";

import { memo, useState } from "react";
import Link from "next/link";
import { Mail, PenSquare, RefreshCw, AlertCircle, Maximize2 } from "lucide-react";
import { useAuth } from "@/lib/client/auth";
import { useMail } from "@/lib/client/mail";
import { fmtMailDate, fmtTime } from "@/lib/client/format";
import { Loading } from "./ui";
import { ComposeModal, MessageModal } from "./mail-parts";

/** Inbox card for the dashboard. Data and the 2-minute poll live in MailProvider. */
function MailPanelImpl() {
  const { user } = useAuth();
  const mail = useMail();
  const [openUid, setOpenUid] = useState<number | null>(null);
  const [compose, setCompose] = useState<null | { to?: string; subject?: string }>(null);

  if (mail.configured === false) {
    return (
      <div className="card card-pad">
        <div className="card-title"><Mail size={16} /> Mail</div>
        <p className="hint" style={{ margin: "8px 0 12px" }}>No company mailbox is linked to your account yet.</p>
        <Link href={`/users/${user!.id}?tab=mailbox`} className="btn btn-primary btn-sm">Set up mailbox</Link>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head tight">
        <h3>Inbox {mail.unseen > 0 && <span className="badge b-red">{mail.unseen} new</span>}</h3>
        <div className="actions">
          <button className="btn btn-ghost btn-sm" onClick={mail.refresh} title={mail.lastChecked ? `Checked ${fmtTime(mail.lastChecked.toISOString())} IST · auto-checks every 2 min` : "Refresh"}>
            <RefreshCw size={14} className={mail.loading ? "spin" : ""} />
          </button>
          <Link href="/mail" className="btn btn-ghost btn-sm" title="Open full mailbox"><Maximize2 size={14} /></Link>
          <button className="btn btn-primary btn-sm" onClick={() => setCompose({})}><PenSquare size={14} /> Compose</button>
        </div>
      </div>

      {mail.error && <div className="alert alert-error" style={{ margin: 12 }}><AlertCircle size={14} style={{ verticalAlign: -2 }} /> {mail.error}</div>}

      {mail.configured === null ? <Loading /> : mail.messages.length === 0 ? (
        <div className="empty tight"><Mail size={26} />Inbox is empty</div>
      ) : (
        <div className="list scroll">
          {mail.messages.map((m) => (
            <div key={m.uid} className={`list-row mail${mail.isSeen(m) ? "" : " unread"}`} onClick={() => setOpenUid(m.uid)}>
              <div className="grow-min">
                <div className="title-line"><span className="t">{m.from.name || m.from.address || "Unknown"}</span></div>
                <div className="sub-line"><span className="ellipsis">{m.subject}</span></div>
              </div>
              <span className="hint nowrap">{fmtMailDate(m.date)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="foot-note">{mail.lastChecked ? `Checked ${fmtTime(mail.lastChecked.toISOString())} IST · refreshes every 2 min` : "Checking…"}</div>

      {openUid && <MessageModal uid={openUid} onClose={() => setOpenUid(null)} onReply={(to, subject) => { setOpenUid(null); setCompose({ to, subject }); }} />}
      {compose && <ComposeModal initial={compose} onClose={() => setCompose(null)} />}
    </div>
  );
}
export const MailPanel = memo(MailPanelImpl);
