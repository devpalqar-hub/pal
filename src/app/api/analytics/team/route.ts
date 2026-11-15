import { NextResponse } from "next/server";
import { authed } from "@/lib/http";
import { forbidden } from "@/lib/auth";
import { canViewTeamAnalytics, teamAnalytics } from "@/lib/analytics";

/** Today's status and 7-day performance of every PAL under you (MANAGER, COMPANY_HEAD, SUPER_ADMIN). */
export const GET = authed(async (_req, actor) => {
  if (!canViewTeamAnalytics(actor.role)) return forbidden();
  return NextResponse.json(await teamAnalytics(actor));
});
