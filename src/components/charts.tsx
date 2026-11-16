"use client";

import { useState, type ReactNode } from "react";

/* Status / state colours — fixed per entity, never by rank. Text never wears these colours. */
export const TASK_COLORS: Record<string, string> = {
  TODO: "#94a3b8",
  IN_PROGRESS: "#3b82f6",
  PAUSED: "#f59e0b",
  IN_REVIEW: "#8b5cf6",
  DONE: "#10b981",
};
export const TASK_LABELS: Record<string, string> = { TODO: "To do", IN_PROGRESS: "In progress", PAUSED: "Paused", IN_REVIEW: "In review", DONE: "Done" };

export const PRESENCE_COLORS: Record<string, string> = {
  WORKING: "#10b981",
  PAUSED: "#f59e0b",
  STOPPED: "#3b82f6",
  ON_LEAVE: "#8b5cf6",
  NOT_STARTED: "#cbd5e1",
};
export const PRESENCE_LABELS: Record<string, string> = { WORKING: "Working", PAUSED: "On break", STOPPED: "Checked out", ON_LEAVE: "On leave", NOT_STARTED: "Not checked in" };

/** Collapses raw task status counts into the 5 display buckets. */
export function taskBuckets(counts: Record<string, number>) {
  return [
    { key: "TODO", value: counts.TODO ?? 0 },
    { key: "IN_PROGRESS", value: counts.IN_PROGRESS ?? 0 },
    { key: "PAUSED", value: counts.PAUSED ?? 0 },
    { key: "IN_REVIEW", value: counts.IN_REVIEW ?? 0 },
    { key: "DONE", value: (counts.COMPLETED ?? 0) + (counts.ENDED ?? 0) },
  ];
}

/* ── Tooltip: follows the hovered mark ── */
function useTip() {
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null);
  const node = tip && <div className="viz-tip" style={{ left: tip.x, top: tip.y }}>{tip.content}</div>;
  return { tip: node, show: (x: number, y: number, content: ReactNode) => setTip({ x, y, content }), hide: () => setTip(null) };
}

/* ── Progress ring: one headline value against a target ── */
export function Ring({ value, max, size = 104, stroke = 10, color = "var(--primary)", children }: { value: number; max: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(pct * 100)}% of target`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eceef5" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dasharray .5s" }} />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

/* ── Week bars: worked hours per day with a dashed daily target ── */
export function WeekBars({ days, target, height = 130 }: { days: { label: string; minutes: number; sub?: string; muted?: boolean; highlight?: boolean }[]; target: number; height?: number }) {
  const { tip, show, hide } = useTip();
  const maxV = Math.max(target * 1.15, ...days.map((d) => d.minutes), 60);
  const W = 100 / days.length;
  const y = (v: number) => height - (v / maxV) * height;
  return (
    <div className="viz" onMouseLeave={hide}>
      <svg width="100%" height={height + 22} viewBox={`0 0 100 ${height + 22}`} preserveAspectRatio="none" role="img" aria-label="Hours worked per day">
        <line x1="0" x2="100" y1={height} y2={height} stroke="#e4e7ef" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1="0" x2="100" y1={y(target)} y2={y(target)} stroke="#64748b" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="wb-bars" style={{ height }}>
        {days.map((d, i) => {
          const h = (d.minutes / maxV) * height;
          return (
            <div key={i} className="wb-col" style={{ width: `${W}%` }}
              onMouseMove={(e) => show(e.nativeEvent.offsetX + (e.currentTarget as HTMLElement).offsetLeft, Math.max(0, height - h - 8), <><b>{d.sub ?? d.label}</b><br />{fmtH(d.minutes)} worked</>)}>
              <div className="wb-bar" style={{ height: Math.max(d.minutes ? 3 : 0, h), background: d.muted ? "#cbd5e1" : d.highlight ? "var(--primary)" : "#8fb0d6" }} />
            </div>
          );
        })}
      </div>
      <div className="wb-labels">{days.map((d, i) => <span key={i} style={{ width: `${W}%`, fontWeight: d.highlight ? 700 : 400 }}>{d.label}</span>)}</div>
      <div className="wb-target" style={{ top: y(target) - 9 }}>Target {fmtH(target)}</div>
      {tip}
    </div>
  );
}

/* ── Donut with legend (identity never by colour alone) ── */
export function Donut({ segments, size = 120, stroke = 16, center }: { segments: { key: string; value: number; color: string; label: string }[]; size?: number; stroke?: number; center?: ReactNode }) {
  const { tip, show, hide } = useTip();
  const total = segments.reduce((n, s) => n + s.value, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = total > 0 && segments.filter((s) => s.value > 0).length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <div className="donut-wrap" onMouseLeave={hide}>
      <div className="viz" style={{ width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} role="img" aria-label="Task status breakdown">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eceef5" strokeWidth={stroke} />
          {total > 0 && segments.map((s) => {
            if (!s.value) return null;
            const len = (s.value / total) * c;
            const el = (
              <circle key={s.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
                strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`}
                onMouseMove={(e) => show(e.nativeEvent.offsetX, e.nativeEvent.offsetY - 10, <><b>{s.label}</b><br />{s.value} ({Math.round((s.value / total) * 100)}%)</>)}
                style={{ cursor: "default" }} />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="ring-center">{center ?? <><div className="ring-num">{total}</div><div className="ring-cap">total</div></>}</div>
        {tip}
      </div>
      <ul className="legend">
        {segments.map((s) => (
          <li key={s.key}><span className="sw" style={{ background: s.color }} />{s.label}<b>{s.value}</b></li>
        ))}
      </ul>
    </div>
  );
}

/* ── Horizontal stacked bar (100%) with legend ── */
export function StackBar({ segments, height = 12, legend = true }: { segments: { key: string; value: number; color: string; label: string }[]; height?: number; legend?: boolean }) {
  const { tip, show, hide } = useTip();
  const total = segments.reduce((n, s) => n + s.value, 0);
  return (
    <div>
      <div className="viz stackbar" style={{ height }} onMouseLeave={hide}>
        {total === 0 ? <div className="sb-empty" /> : segments.filter((s) => s.value > 0).map((s) => (
          <div key={s.key} className="sb-seg" style={{ flexGrow: s.value, background: s.color }}
            onMouseMove={(e) => show(e.nativeEvent.offsetX + (e.currentTarget as HTMLElement).offsetLeft, -34, <><b>{s.label}</b> · {s.value}</>)} />
        ))}
        {tip}
      </div>
      {legend && (
        <ul className="legend inline">
          {segments.map((s) => <li key={s.key}><span className="sw" style={{ background: s.color }} />{s.label}<b>{s.value}</b></li>)}
        </ul>
      )}
    </div>
  );
}

/* ── Sparkline bars for table rows ── */
export function MiniBars({ values, target, labels }: { values: number[]; target: number; labels?: string[] }) {
  const max = Math.max(target, ...values, 1);
  return (
    <div className="minibars" role="img" aria-label={`Last ${values.length} days`}>
      {values.map((v, i) => (
        <span key={i} title={`${labels?.[i] ?? ""} ${fmtH(v)}`.trim()} style={{ height: `${Math.max(v ? 8 : 4, (v / max) * 100)}%`, background: v === 0 ? "#e2e8f0" : v >= target ? "#10b981" : "#8fb0d6" }} />
      ))}
    </div>
  );
}

export function Bar({ value, color = "var(--primary)" }: { value: number; color?: string }) {
  return <div className="progress" style={{ height: 6 }}><span style={{ width: `${Math.min(100, value)}%`, background: color }} /></div>;
}

export const fmtH = (m: number) => {
  const h = Math.floor(m / 60), mm = Math.round(m % 60);
  return h ? `${h}h ${mm}m` : `${mm}m`;
};
