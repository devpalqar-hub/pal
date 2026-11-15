import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { Spinner } from "@/components/ui";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="center-screen"><Spinner /></div>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
