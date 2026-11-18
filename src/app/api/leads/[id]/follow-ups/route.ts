import { NextResponse } from "next/server";
import { authed, parseBody } from "@/lib/http";
import { badRequest, conflict } from "@/lib/auth";
import { followUpSchema } from "@/lib/validation";
import { leadCtx } from "@/lib/leads";
import { scheduleFollowUp } from "@/lib/follow-ups";

/** Schedule the next follow-up (call, email, WhatsApp, meeting…) and who does it. Reminded 5 minutes before. */
export const POST = authed<{ id: string }>(async (req, actor, { id }) => {
  const ctx = await leadCtx(id, actor);
  if ("error" in ctx) return ctx.error;
  if (ctx.lead.stage === "WON" || ctx.lead.stage === "LOST") return conflict("This lead is closed — reopen it first");
  const body = await parseBody(req, followUpSchema);
  if ("error" in body) return body.error;
  const r = await scheduleFollowUp(ctx.lead, body.data, actor);
  if ("error" in r) return badRequest(r.error);
  return NextResponse.json(r, { status: 201 });
});
