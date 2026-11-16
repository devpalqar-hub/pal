import nodemailer, { type Transporter } from "nodemailer";
import type { NotificationType } from "@prisma/client";
import { prisma } from "./prisma";

export const TASK_TYPES: NotificationType[] = ["TASK_ASSIGNED", "TASK_REVIEW_REQUESTED", "TASK_COMPLETED", "TASK_APPROVED", "TASK_REJECTED", "TASK_ENDED", "TASK_DECLINED"];
export const LEAVE_TYPES: NotificationType[] = ["LEAVE_DECIDED"];
export const MEETING_TYPES: NotificationType[] = ["MEETING_INVITE", "MEETING_UPDATED", "MEETING_CANCELLED"];
export const REQUEST_NOTIFY_TYPES: NotificationType[] = ["REQUEST_RECEIVED", "REQUEST_REJECTED", "REQUEST_RESUBMITTED", "REQUEST_APPROVED", "REQUEST_COMPLETED"];

interface Input {
  userId: number;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  taskId?: number;
}

/** Stores an in-app notification and, if enabled, emails a copy. Never throws into the caller. */
export async function notify(n: Input) {
  try {
    const row = await prisma.notification.create({
      data: { ...n, title: n.title.slice(0, 180), link: n.link ?? (n.taskId ? `/tasks?open=${n.taskId}` : undefined) },
    });
    void sendEmailCopy(n.userId, row.title, row.body, row.link).catch((e) => console.error("notification email failed:", e?.message ?? e));
  } catch (e) {
    console.error("notify failed:", e);
  }
}

let transport: Transporter | null | undefined;
function getTransport() {
  if (transport !== undefined) return transport;
  const user = process.env.NOTIFY_MAIL_USER;
  const pass = process.env.NOTIFY_MAIL_PASSWORD;
  if (!user || !pass) return (transport = null); // email notifications are optional
  const port = Number(process.env.MAIL_SMTP_PORT ?? 465);
  return (transport = nodemailer.createTransport({
    host: process.env.MAIL_HOST ?? "mail.palqar.com",
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: process.env.MAIL_TLS_REJECT_UNAUTHORIZED !== "false" },
    connectionTimeout: 10_000,
    socketTimeout: 20_000,
  }));
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function sendEmailCopy(userId: number, title: string, body: string | null, link: string | null) {
  const t = getTransport();
  if (!t) return;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, mailEmail: true, notifyEmail: true, isActive: true } });
  if (!u || !u.isActive || !u.notifyEmail) return;
  const url = link ? `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}${link}` : null;
  await t.sendMail({
    from: { name: "PAL", address: process.env.NOTIFY_MAIL_USER! },
    to: u.mailEmail ?? u.email,
    subject: `[PAL] ${title}`,
    text: `Hi ${u.name},\n\n${title}${body ? `\n${body}` : ""}${url ? `\n\nOpen in PAL: ${url}` : ""}\n\n— PAL`,
    html: `<div style="font:14px system-ui,sans-serif;color:#0f172a;max-width:520px"><p>Hi ${esc(u.name)},</p><p><b>${esc(title)}</b>${body ? `<br>${esc(body)}` : ""}</p>${url ? `<p><a href="${url}" style="background:#4f46e5;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none">Open in PAL</a></p>` : ""}<p style="color:#64748b;font-size:12px">You receive this because email notifications are on. Turn them off in PAL → Notifications.</p></div>`,
  });
}
