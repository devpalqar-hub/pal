import { NextResponse } from "next/server";
import { authed, parseId } from "@/lib/http";
import { badRequest } from "@/lib/auth";
import { getMailbox, MailError, readMessage } from "@/lib/mail";

export const GET = authed<{ uid: string }>(async (_req, actor, { uid }) => {
  const id = parseId(uid);
  if (!id) return badRequest("Invalid id");
  try {
    return NextResponse.json({ message: await readMessage(await getMailbox(actor.id), id) });
  } catch (e) {
    if (e instanceof MailError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
