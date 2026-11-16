const TOKEN_KEY = "pal_token";

/**
 * The session lives in sessionStorage, so every browser tab/window has its own login.
 * (localStorage is shared by all tabs: a second login in another window used to overwrite
 * the first window's token and log that user out or swap their identity.)
 */
export const tokenStore = {
  get: () => (typeof window === "undefined" ? null : sessionStorage.getItem(TOKEN_KEY)),
  set: (t: string) => {
    sessionStorage.setItem(TOKEN_KEY, t);
    localStorage.removeItem(TOKEN_KEY); // drop the legacy shared token
  },
  clear: () => {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  },
};

export class ApiError extends Error {
  constructor(message: string, public status: number, public data?: unknown) {
    super(message);
  }
}

function messageFrom(data: unknown, fallback: string): string {
  const e = (data as { error?: unknown })?.error;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const f = e as { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
    const first = Object.entries(f.fieldErrors ?? {})[0];
    if (first) return `${first[0]}: ${first[1][0]}`;
    if (f.formErrors?.[0]) return f.formErrors[0];
  }
  return fallback;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(path, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: {
      ...(opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: !opts.body ? undefined : opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith("/api/auth")) {
      tokenStore.clear();
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (typeof window !== "undefined") window.location.href = "/login";
    }
    throw new ApiError(messageFrom(data, res.statusText || "Request failed"), res.status, data);
  }
  return data as T;
}

/** Downloads an authenticated file (the token travels in a header, so a plain link won't work). */
export async function apiDownload(path: string, filename: string) {
  const token = tokenStore.get();
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError((await res.json().catch(() => null))?.error ?? "Download failed", res.status);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
