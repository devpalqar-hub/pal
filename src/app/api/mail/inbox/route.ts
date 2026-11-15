import { NextResponse } from "next/server";
import { authed } from "@/lib/http";
import { getMailbox, listInbox, MailError } from "@/lib/mail";

/** Inbox page. ?limit= (max 50), ?before=<uid> loads older messages. The browser polls this every 2 minutes. */
export const GET = authed(async (req, actor) => {
  try {
    const q = new URL(req.url).searchParams;
    const limit = Math.min(50, Number(q.get("limit")) || 25);
    const before = Number(q.get("before")) || undefined;
    return NextResponse.json(await listInbox(await getMailbox(actor.id), limit, before));
  } catch (e) {
    if (e instanceof MailError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
