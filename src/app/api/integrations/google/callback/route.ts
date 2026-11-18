import { NextResponse } from "next/server";
import { connectAccount, GoogleError, userFromState } from "@/lib/google-calendar";

/** OAuth redirect target. Authenticated by the signed `state`, since the browser sends no Bearer token here. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/meetings?google=${q}`, process.env.APP_URL ?? url.origin));
  if (url.searchParams.get("error")) return back("denied");
  const userId = userFromState(url.searchParams.get("state") ?? "");
  const code = url.searchParams.get("code");
  if (!userId || !code) return back("invalid");
  try {
    await connectAccount(userId, code);
    return back("connected");
  } catch (e) {
    console.error("Google connect failed:", e);
    return back(e instanceof GoogleError ? "failed" : "error");
  }
}
