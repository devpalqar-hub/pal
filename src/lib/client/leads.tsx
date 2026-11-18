/** Display metadata for the sales pipeline (mirrors prisma LeadStage). */
export const LEAD_STAGES: { key: string; label: string; tone: string; hint: string }[] = [
  { key: "NEW", label: "New lead", tone: "b-gray", hint: "Just came in, nobody has talked to them yet" },
  { key: "CONTACTED", label: "Contacted", tone: "b-blue", hint: "First call / email done" },
  { key: "MQL", label: "MQL", tone: "b-blue", hint: "Marketing qualified — fits the profile, showed interest" },
  { key: "SQL", label: "SQL", tone: "b-purple", hint: "Sales qualified — real need, budget, decision maker" },
  { key: "DEMO_SCHEDULED", label: "Demo scheduled", tone: "b-amber", hint: "Demo meeting booked" },
  { key: "DEMO_DONE", label: "Demo done", tone: "b-amber", hint: "Demo delivered" },
  { key: "PROPOSAL", label: "Proposal sent", tone: "b-purple", hint: "Quote / proposal shared" },
  { key: "NEGOTIATION", label: "Negotiation", tone: "b-amber", hint: "Discussing price and terms" },
  { key: "WON", label: "Won", tone: "b-green", hint: "Deal closed" },
  { key: "LOST", label: "Lost", tone: "b-red", hint: "Not going ahead" },
];
export const STAGE = Object.fromEntries(LEAD_STAGES.map((s) => [s.key, s]));
export const OPEN_STAGE_KEYS = LEAD_STAGES.filter((s) => s.key !== "WON" && s.key !== "LOST").map((s) => s.key);

export const TEMPS: { key: string; label: string; tone: string; emoji: string }[] = [
  { key: "HOT", label: "Hot", tone: "b-red", emoji: "🔥" },
  { key: "WARM", label: "Warm", tone: "b-amber", emoji: "☀️" },
  { key: "COLD", label: "Cold", tone: "b-blue", emoji: "❄️" },
];
export const TEMP = Object.fromEntries(TEMPS.map((t) => [t.key, t]));

export const SOURCES = ["WEBSITE", "SEARCH_ENGINE", "REFERRAL", "SOCIAL_MEDIA", "EMAIL_CAMPAIGN", "COLD_CALL", "EVENT", "PARTNER", "ADVERTISEMENT", "OTHER"];
export const FOLLOW_UP_TYPES = ["CALL", "EMAIL", "WHATSAPP", "MEETING", "OTHER"];
export const pretty = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

export const fmtMoney = (v: number | string | null | undefined, cur = "INR") =>
  v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("en-IN", { style: "currency", currency: cur, maximumFractionDigits: 0 });

export function StageBadge({ stage }: { stage: string }) {
  const s = STAGE[stage];
  return <span className={`badge ${s?.tone ?? "b-gray"}`}>{s?.label ?? stage}</span>;
}
export function TempBadge({ temperature }: { temperature: string }) {
  const t = TEMP[temperature];
  return <span className={`badge ${t?.tone ?? "b-gray"}`}>{t?.emoji} {t?.label ?? temperature}</span>;
}
