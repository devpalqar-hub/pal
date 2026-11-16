/** Calls PAL's own API as the signed-in user, so every existing permission check still applies to the agent. */
export async function callApi(req: Request, method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(new URL(path, req.url), {
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
