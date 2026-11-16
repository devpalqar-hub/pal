"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/client/auth";
import { ROLE_RANK } from "@/lib/client/format";

/** Shows a clear "no access" panel instead of failing API calls when a role lacks permission for a page. */
export function RequireRole({ min, children }: { min: keyof typeof ROLE_RANK; children: ReactNode }) {
  const { user } = useAuth();
  if (user && ROLE_RANK[user.role] < ROLE_RANK[min]) {
    return (
      <div className="card card-pad" style={{ maxWidth: 460, margin: "40px auto", textAlign: "center" }}>
        <ShieldAlert size={32} color="var(--warning)" />
        <h3 style={{ margin: "10px 0 6px" }}>You don’t have access to this page</h3>
        <p className="hint" style={{ marginBottom: 16 }}>This area is for team leads and above. Your account is not affected.</p>
        <Link href="/dashboard" className="btn btn-primary">Back to dashboard</Link>
      </div>
    );
  }
  return <>{children}</>;
}
