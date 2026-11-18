import { NextResponse } from "next/server";
import { authed } from "@/lib/http";
import { authUrl, googleConfigured } from "@/lib/google-calendar";

/** Returns the Google consent URL (the browser then navigates there). */
export const POST = authed(async (_req, actor) => {
  if (!googleConfigured()) return NextResponse.json({ error: "Google Calendar is not set up on this server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)" }, { status: 501 });
  return NextResponse.json({ url: authUrl(actor.id) });
});
