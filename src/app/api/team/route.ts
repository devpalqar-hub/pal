import { NextResponse } from "next/server";
import { authed } from "@/lib/http";
import { forbidden } from "@/lib/auth";
import { canOversee, teamOverview } from "@/lib/oversight";

/** Everyone under the caller (team leads, managers, company heads): today's status, task load and work culture. ?days=7..90 */
export const GET = authed(async (req, actor) => {
  if (!canOversee(actor.role)) return forbidden();
  const days = Math.min(90, Math.max(7, Number(new URL(req.url).searchParams.get("days")) || 30));
  return NextResponse.json(await teamOverview(actor, days));
});
