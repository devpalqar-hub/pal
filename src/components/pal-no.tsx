"use client";

import { useState } from "react";
import { Hash, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { fmtPalNo, parsePalNo } from "@/lib/client/format";
import { useToast } from "./ui";

/** PAL-0012 chip. With `copy`, clicking copies the number. */
export function PalNo({ n, copy }: { n?: number | null; copy?: boolean }) {
  const [done, setDone] = useState(false);
  if (!n) return null;
  const label = fmtPalNo(n);
  if (!copy) return <span className="pal-no">{label}</span>;
  return (
    <button type="button" className="pal-no" title="Copy reference" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(label); setDone(true); setTimeout(() => setDone(false), 1200); }}>
      {label}{done && <Check size={11} />}
    </button>
  );
}

/** Top-bar "Go to PAL-…" box: opens the task or request with that number. */
export function GoToPalNo() {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  async function go() {
    const no = parsePalNo(q);
    if (!no) return toast("Type a PAL number, e.g. PAL-0012", true);
    try { const r = await api(`/api/lookup?q=${no}`); setQ(""); router.push(r.href); }
    catch (e) { toast(e instanceof Error ? e.message : "Not found", true); }
  }
  return (
    <form className="goto-box" onSubmit={(e) => { e.preventDefault(); go(); }} title="Open a task or request by its PAL number">
      <Hash size={15} />
      <input className="input" placeholder="Go to PAL-…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Go to PAL number" />
    </form>
  );
}
