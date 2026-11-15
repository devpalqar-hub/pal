import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, parseBody, parseId } from "@/lib/http";
import { badRequest, conflict, forbidden, notFound } from "@/lib/auth";
import { mailboxSchema } from "@/lib/validation";
import { canManageUser } from "@/lib/roles";
import { encryptSecret, MailError, verifyLogin } from "@/lib/mail";

type P = { id: string };

/** Set / replace the user's company mailbox. Allowed for the user themself and their superiors. Credentials are verified against the mail server first. */
export const PUT = authed<P>(async (req, actor, { id }) => {
  const uid = parseId(id);
  if (!uid) return badRequest("Invalid id");
  const target = await prisma.user.findUnique({ where: { id: uid } });
  if (!target) return notFound();
  if (!canManageUser(actor, target)) return forbidden();

  const body = await parseBody(req, mailboxSchema);
  if ("error" in body) return body.error;
  const { mailEmail, mailPassword } = body.data;

  const owner = await prisma.user.findUnique({ where: { mailEmail } });
  if (owner && owner.id !== uid) return conflict("Mailbox is already assigned to another user");

  try {
    await verifyLogin(mailEmail, mailPassword);
  } catch (e) {
    if (e instanceof MailError) return NextResponse.json({ error: e.message }, { status: e.status === 401 ? 400 : e.status });
    throw e;
  }
  await prisma.user.update({ where: { id: uid }, data: { mailEmail, mailPasswordEnc: encryptSecret(mailPassword) } });
  return NextResponse.json({ ok: true, mailEmail });
});

export const DELETE = authed<P>(async (_req, actor, { id }) => {
  const uid = parseId(id);
  if (!uid) return badRequest("Invalid id");
  const target = await prisma.user.findUnique({ where: { id: uid } });
  if (!target) return notFound();
  if (!canManageUser(actor, target)) return forbidden();
  await prisma.user.update({ where: { id: uid }, data: { mailEmail: null, mailPasswordEnc: null } });
  return NextResponse.json({ ok: true });
});
