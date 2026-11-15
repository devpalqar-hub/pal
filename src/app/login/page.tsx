"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, CheckSquare, Clock, Users, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/client/auth";
import { Spinner } from "@/components/ui";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <aside className="login-art">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark">P</div> PAL
        </div>
        <div>
          <h2>Run projects and people from one workspace.</h2>
          <p>Plan work, track time and keep every team aligned — from the boardroom to the front line.</p>
          <ul className="feature-list">
            <li><span className="dot"><CheckSquare size={16} /></span> Projects, tasks and review workflows</li>
            <li><span className="dot"><Clock size={16} /></span> Time tracking and daily attendance</li>
            <li><span className="dot"><Users size={16} /></span> Role-based teams, schedules and leave</li>
            <li><span className="dot"><ShieldCheck size={16} /></span> Secure, permission-aware access</li>
          </ul>
        </div>
        <div style={{ color: "#94a3b8", fontSize: 13 }}>© PAL</div>
      </aside>

      <main className="login-form-side">
        <form className="login-box" onSubmit={submit}>
          <h1>Welcome back</h1>
          <p className="sub">Sign in to your PAL account to continue.</p>

          {error && <div className="alert alert-error" role="alert">{error}</div>}

          <div className="field">
            <label className="label" htmlFor="email">Email</label>
            <div className="input-wrap">
              <Mail size={18} />
              <input id="email" className="input" type="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="password">Password</label>
            <div className="input-wrap">
              <Lock size={18} />
              <input id="password" className="input" type={show ? "text" : "password"} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ paddingRight: 44 }} />
              <button type="button" className="btn btn-ghost btn-sm toggle" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button className="btn btn-primary btn-lg" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? <Spinner /> : "Sign in"}
          </button>
          <p className="hint" style={{ marginTop: 20, textAlign: "center" }}>
            Accounts are created by your administrator. Contact them if you need access.
          </p>
        </form>
      </main>
    </div>
  );
}
