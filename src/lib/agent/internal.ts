/** Loopback address of this server. req.url can't be used: behind a TLS proxy it is the public https:// origin, which the Node process itself doesn't speak. */
const base = () => (process.env.INTERNAL_API_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`).replace(/\/$/, "");

/** Calls PAL's own API as the signed-in user, so every existing permission check still applies to the agent. */
export async function callApi(req: Request, method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: { Authorization: req.headers.get("authorization") ?? "", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

export function apiError(data: any, status: number): string {
  const e = data?.error;
  if (typeof e === "string") return e;
  const first = Object.entries(e?.fieldErrors ?? {})[0] as [string, string[]] | undefined;
  return first ? `${first[0]}: ${first[1][0]}` : `Request failed (${status})`;
}
