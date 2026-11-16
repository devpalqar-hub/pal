"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, tokenStore } from "./api";

export interface Me {
  id: number;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "COMPANY_HEAD" | "MANAGER" | "LEAD" | "STAFF";
  designation: string | null;
  schedule?: Record<string, any> | null;
}

interface AuthCtx {
  user: Me | null;
  loading: boolean;
  /** Set when the profile could not be loaded for a reason other than an invalid session (network / server). */
  error: string | null;
  retry: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    let live = true;
    (async () => {
      setError(null);
      // Only a genuinely invalid session logs you out. A slow network or a server hiccup is retried,
      // and the session is kept so a reload recovers.
      for (let i = 0; i < 3; i++) {
        try {
          const r = await api<{ user: Me }>("/api/users/me");
          if (live) setUser(r.user);
          break;
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) { tokenStore.clear(); break; }
          if (i === 2 && live) setError("Can’t reach the server right now.");
          else await sleep(700 * (i + 1));
        }
      }
      if (live) setLoading(false);
    })();
    return () => { live = false; };
  }, [attempt]);

  const retry = useCallback(() => { setLoading(true); setAttempt((n) => n + 1); }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ token: string; user: Me }>("/api/auth/login", { body: { email, password } });
    tokenStore.set(r.token);
    setError(null);
    setUser(r.user);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    router.replace("/login");
  }, [router]);

  return <Ctx.Provider value={{ user, loading, error, retry, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
