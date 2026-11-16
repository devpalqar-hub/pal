"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Paperclip, X, Download } from "lucide-react";
import { api, apiDownload } from "@/lib/client/api";
import { useMail } from "@/lib/client/mail";
import { fmtDateTime } from "@/lib/client/format";
import { Field, Loading, Modal, Spinner, useToast } from "./ui";
import { RichTextEditor } from "./rich-text";

const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Loads a message (marks it read) */
export function useMessage(uid: number | null, onFail?: () => void) {
  const { markRead } = useMail();
  const toast = useToast();
  const [m, setM] = useState<any>(null);
  useEffect(() => {
    setM(null);
    if (!uid) return;
    let live = true;
    api(`/api/mail/messages/${uid}`)
      .then((r) => { if (live) { setM(r.message); markRead(uid, r.message.wasSeen); } })
      .catch((e) => { toast(e.message, true); onFail?.(); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);
  return m;
}

export const replySubject = (s: string) => (/^re:/i.test(s) ? s : `Re: ${s}`);

/** Header + body + downloadable attachments. Remote content is blocked and scripts can't run in the sandboxed frame. */
export function MessageBody({ m, frameHeight = 340 }: { m: any; frameHeight?: number | string }) {
  const toast = useToast();
  const srcDoc = m.html
    ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><base target="_blank"><style>body{font:14px system-ui,sans-serif;margin:0;color:#0f172a}</style>${m.html}`
    : null;
  return (
    <>
      <dl className="kv" style={{ gridTemplateColumns: "56px 1fr", marginBottom: 14, fontSize: 13 }}>
        <dt>From</dt><dd>{m.from.name ? `${m.from.name} <${m.from.address}>` : m.from.address}</dd>
        <dt>To</dt><dd>{m.to.map((t: any) => t.address).join(", ") || "—"}</dd>
        {m.cc.length > 0 && <><dt>Cc</dt><dd>{m.cc.map((t: any) => t.address).join(", ")}</dd></>}
        <dt>Date</dt><dd>{m.date ? `${fmtDateTime(m.date)} IST` : "—"}</dd>
      </dl>
      {srcDoc ? (
        <iframe title="Email body" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={srcDoc} style={{ width: "100%", height: frameHeight, border: "1px solid var(--border)", borderRadius: 8 }} />
      ) : (
        <pre style={{ whiteSpace: "pre-wrap", font: "inherit", margin: 0 }}>{m.text || "(empty message)"}</pre>
      )}
      {m.attachments.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="hint" style={{ marginBottom: 6 }}><Paperclip size={13} style={{ verticalAlign: -2 }} /> {m.attachments.length} attachment(s)</div>
          <div className="actions">
            {m.attachments.map((a: any) => (
              <button key={a.index} className="btn btn-sm" onClick={() => apiDownload(`/api/mail/messages/${m.uid}/attachments/${a.index}`, a.filename).catch((e) => toast(e.message, true))}>
                <Download size={14} /> {a.filename} <span className="hint">{fmtSize(a.size)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function MessageModal({ uid, onClose, onReply }: { uid: number; onClose: () => void; onReply: (to: string, subject: string) => void }) {
  const m = useMessage(uid, onClose);
  return (
    <Modal title={m?.subject ?? "Loading…"} onClose={onClose} wide
      footer={m && <><button className="btn" onClick={onClose}>Close</button><button className="btn btn-primary" onClick={() => onReply(m.from.address, replySubject(m.subject))}>Reply</button></>}>
      {!m ? <Loading /> : <MessageBody m={m} />}
    </Modal>
  );
}

export function ComposeModal({ initial, onClose }: { initial: { to?: string; subject?: string }; onClose: () => void }) {
  const toast = useToast();
  const { refresh } = useMail();
  const [f, setF] = useState({ to: initial.to ?? "", cc: "", subject: initial.subject ?? "", text: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const total = files.reduce((n, x) => n + x.size, 0);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files, ...Array.from(list)];
    if (next.length > 10) return toast("You can attach up to 10 files", true);
    if (next.reduce((n, x) => n + x.size, 0) > 20 * 1048576) return toast("Attachments are limited to 20 MB in total", true);
    setFiles(next);
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (!f.text && files.length === 0) { toast("Write a message or attach a file", true); setBusy(false); return; }
      const fd = new FormData();
      fd.set("to", f.to); fd.set("cc", f.cc); fd.set("subject", f.subject); fd.set("html", f.text);
      files.forEach((x) => fd.append("files", x));
      await api("/api/mail/send", { body: fd });
      toast("Email sent");
      onClose();
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to send", true);
      setBusy(false);
    }
  }

  return (
    <Modal title="New message" onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Discard</button><button className="btn btn-primary" form="compose" disabled={busy}>{busy ? <Spinner /> : "Send"}</button></>}>
      <form id="compose" onSubmit={send}>
        <Field label="To" hint="Separate several addresses with commas"><input className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} required autoFocus={!initial.to} placeholder="name@company.com" /></Field>
        <Field label="Cc"><input className="input" value={f.cc} onChange={(e) => setF({ ...f, cc: e.target.value })} /></Field>
        <Field label="Subject"><input className="input" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
        <Field label="Message"><RichTextEditor value={f.text} onChange={(html) => setF((s) => ({ ...s, text: html }))} minHeight={180} autoFocus={!!initial.to} placeholder="Write your message…" /></Field>
        <input ref={pick} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <button type="button" className="btn btn-sm" onClick={() => pick.current?.click()}><Paperclip size={14} /> Attach files</button>
        {files.length > 0 && (
          <div className="attach-list">
            {files.map((x, i) => (
              <span key={i} className="attach-chip"><Paperclip size={12} /> {x.name} <span className="hint">{fmtSize(x.size)}</span>
                <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Remove"><X size={13} /></button></span>
            ))}
            <span className="hint">{fmtSize(total)} of 20 MB</span>
          </div>
        )}
      </form>
    </Modal>
  );
}
