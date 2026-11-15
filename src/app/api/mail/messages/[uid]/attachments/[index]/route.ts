import { NextResponse } from "next/server";
import { authed, parseId } from "@/lib/http";
import { badRequest } from "@/lib/auth";
import { getMailbox, MailError, readAttachment } from "@/lib/mail";

export const GET = authed<{ uid: string; index: string }>(async (_req, actor, p) => {
  const uid = parseId(p.uid);
  const index = Number(p.index);
  if (!uid || !Number.isInteger(index) || index < 0) return badRequest("Invalid id");
  try {
    const a = await readAttachment(await getMailbox(actor.id), uid, index);
    return new Response(new Uint8Array(a.content), {
      headers: {
        "Content-Type": a.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof MailError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
