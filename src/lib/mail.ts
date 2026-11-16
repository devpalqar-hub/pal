import crypto from "node:crypto";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import { prisma } from "./prisma";

const HOST = () => process.env.MAIL_HOST ?? "mail.palqar.com";
const IMAP_PORT = () => Number(process.env.MAIL_IMAP_PORT ?? 993);
const SMTP_PORT = () => Number(process.env.MAIL_SMTP_PORT ?? 465);
const rejectUnauthorized = () => process.env.MAIL_TLS_REJECT_UNAUTHORIZED !== "false";

/* ── Credential encryption (AES-256-GCM). Passwords must be recoverable to log in to IMAP/SMTP. ── */
function key() {
  const secret = process.env.MAIL_SECRET_KEY ?? process.env.JWT_SECRET;
  if (!secret) throw new Error("MAIL_SECRET_KEY (or JWT_SECRET) is not set");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export class MailError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

export interface Mailbox { email: string; password: string; name: string }

export async function getMailbox(userId: number): Promise<Mailbox> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, mailEmail: true, mailPasswordEnc: true } });
  if (!u?.mailEmail || !u.mailPasswordEnc) throw new MailError("Mailbox not configured", 409);
  try {
    return { email: u.mailEmail, password: decryptSecret(u.mailPasswordEnc), name: u.name };
  } catch {
    throw new MailError("Stored mailbox credentials are unreadable; please re-enter them", 409);
  }
}

function imapClient(email: string, password: string) {
  const client = new ImapFlow({
    host: HOST(),
    port: IMAP_PORT(),
    secure: IMAP_PORT() === 993,
    auth: { user: email, pass: password },
    logger: false,
    tls: { rejectUnauthorized: rejectUnauthorized() },
    socketTimeout: 20_000,
    greetingTimeout: 10_000,
    connectionTimeout: 10_000,
  });
  client.on("error", () => {}); // surfaced through the awaited calls
  return client;
}

async function withImap<T>(box: Pick<Mailbox, "email" | "password">, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  const client = imapClient(box.email, box.password);
  try {
    await client.connect();
  } catch (e) {
    const auth = (e as { authenticationFailed?: boolean }).authenticationFailed;
    // 422, not 401: a bad mailbox password must never look like an expired PAL login
    throw new MailError(auth ? "Mailbox sign-in failed — check the email and password" : `Cannot reach mail server (${HOST()})`, auth ? 422 : 502);
  }
  try {
    return await fn(client);
  } catch (e) {
    if (e instanceof MailError) throw e;
    throw new MailError("Mail server error while reading the mailbox");
  } finally {
    await client.logout().catch(() => client.close());
  }
}

export const verifyLogin = (email: string, password: string) => withImap({ email, password }, async () => true);

export interface MailSummary {
  uid: number;
  from: { name: string; address: string };
  subject: string;
  date: string | null;
  seen: boolean;
}

export async function listInbox(box: Mailbox, limit = 25, beforeUid?: number): Promise<{ messages: MailSummary[]; unseen: number }> {
  return withImap(box, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const messages: MailSummary[] = [];
      const all = (await client.search(beforeUid ? { uid: `1:${beforeUid - 1}` } : { all: true }, { uid: true })) || [];
      const uids = all.sort((x, y) => x - y).slice(-limit);
      if (uids.length > 0) {
        for await (const m of client.fetch(uids.join(","), { uid: true, envelope: true, flags: true, internalDate: true }, { uid: true })) {
          const f = m.envelope?.from?.[0];
          messages.push({
            uid: m.uid,
            from: { name: f?.name ?? "", address: f?.address ?? "" },
            subject: m.envelope?.subject ?? "(no subject)",
            date: (() => { const d = m.envelope?.date ?? m.internalDate; return d ? new Date(d).toISOString() : null; })(),
            seen: m.flags?.has("\\Seen") ?? false,
          });
        }
      }
      const unseen = ((await client.search({ seen: false }, { uid: true })) || []).length;
      return { messages: messages.sort((a, b) => b.uid - a.uid), unseen };
    } finally {
      lock.release();
    }
  });
}

export async function readMessage(box: Mailbox, uid: number) {
  return withImap(box, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const m = await client.fetchOne(String(uid), { source: true, flags: true }, { uid: true });
      if (!m || !m.source) throw new MailError("Message not found", 404);
      const wasSeen = m.flags?.has("\\Seen") ?? false;
      const p = await simpleParser(m.source);
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      const addr = (a: typeof p.to) => (a ? (Array.isArray(a) ? a : [a]).flatMap((x) => x.value).map((v) => ({ name: v.name, address: v.address ?? "" })) : []);
      return {
        uid,
        wasSeen,
        subject: p.subject ?? "(no subject)",
        from: addr(p.from)[0] ?? { name: "", address: "" },
        to: addr(p.to),
        cc: addr(p.cc),
        date: p.date?.toISOString() ?? null,
        text: p.text ?? "",
        html: typeof p.html === "string" ? p.html : null,
        attachments: p.attachments.map((a, index) => ({ index, filename: a.filename ?? "attachment", size: a.size, contentType: a.contentType })),
      };
    } finally {
      lock.release();
    }
  });
}

export async function readAttachment(box: Mailbox, uid: number, index: number) {
  return withImap(box, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const m = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!m || !m.source) throw new MailError("Message not found", 404);
      const att = (await simpleParser(m.source)).attachments[index];
      if (!att) throw new MailError("Attachment not found", 404);
      return { filename: att.filename ?? "attachment", contentType: att.contentType || "application/octet-stream", content: att.content };
    } finally {
      lock.release();
    }
  });
}

export interface OutgoingMail { to: string[]; cc?: string[]; subject: string; text: string; html?: string; attachments?: { filename: string; content: Buffer; contentType?: string }[] }

export async function sendMail(box: Mailbox, msg: OutgoingMail) {
  const transport = nodemailer.createTransport({
    host: HOST(),
    port: SMTP_PORT(),
    secure: SMTP_PORT() === 465,
    auth: { user: box.email, pass: box.password },
    tls: { rejectUnauthorized: rejectUnauthorized() },
    connectionTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    await transport.sendMail({
      from: { name: box.name, address: box.email },
      ...msg,
      html: msg.html ? `<div style="font:14px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#1f2937">${msg.html}</div>` : undefined,
    });
  } catch (e) {
    const code = (e as { responseCode?: number }).responseCode;
    throw new MailError(code === 535 ? "Mailbox sign-in failed — check the email and password" : "Could not send the email", code === 535 ? 422 : 502);
  }
}
