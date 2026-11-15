import { NextResponse } from "next/server";
import { authed } from "@/lib/http";
import { projectAnalytics } from "@/lib/analytics";

/** Progress, task mix, overdue work, logged hours and health for the projects you can see. */
export const GET = authed(async (_req, actor) => NextResponse.json({ projects: await projectAnalytics(actor) }));
