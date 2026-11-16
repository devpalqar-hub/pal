/** Request types and their forms. Shared by the API (validation) and the UI (rendering) — add a type here and both pick it up. */
export type FieldKind = "text" | "textarea" | "select" | "date" | "url" | "number" | "checkbox";
export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  help?: string;
}
export interface RequestTypeDef {
  value: "PROJECT_PLAN" | "DEPLOYMENT" | "REPO_CREATION" | "PULL_REQUEST" | "ACCESS_REQUEST" | "OTHER";
  label: string;
  blurb: string;
  /** What the assignee supplies when they mark it complete */
  resultLabel: string;
  fields: FieldDef[];
}

export const REQUEST_TYPES: RequestTypeDef[] = [
  {
    value: "PROJECT_PLAN", label: "Project plan", blurb: "Get a project plan reviewed and approved.", resultLabel: "Plan document link",
    fields: [
      { key: "objective", label: "Objective", kind: "textarea", required: true, placeholder: "What should this project achieve?" },
      { key: "scope", label: "Scope & deliverables", kind: "textarea", required: true },
      { key: "startDate", label: "Planned start", kind: "date" },
      { key: "targetDate", label: "Target completion", kind: "date" },
      { key: "teamSize", label: "Team size", kind: "number" },
      { key: "budget", label: "Budget estimate", kind: "text", placeholder: "e.g. ₹5,00,000" },
      { key: "risks", label: "Risks & dependencies", kind: "textarea" },
    ],
  },
  {
    value: "DEPLOYMENT", label: "Deployment request", blurb: "Ask for a release to be deployed.", resultLabel: "Deployment / release link",
    fields: [
      { key: "application", label: "Application / service", kind: "text", required: true },
      { key: "environment", label: "Environment", kind: "select", required: true, options: ["Development", "Staging", "Production"] },
      { key: "version", label: "Version, branch or tag", kind: "text", required: true, placeholder: "e.g. v2.4.0 or release/2024-11" },
      { key: "deployDate", label: "Preferred deploy date", kind: "date", required: true },
      { key: "changeSummary", label: "What is changing", kind: "textarea", required: true },
      { key: "downtime", label: "Downtime expected", kind: "select", options: ["No", "Yes — under 15 min", "Yes — over 15 min"] },
      { key: "rollbackPlan", label: "Rollback plan", kind: "textarea" },
      { key: "ticketUrl", label: "Ticket / PR link", kind: "url" },
    ],
  },
  {
    value: "REPO_CREATION", label: "Repository creation", blurb: "Request a new source-code repository.", resultLabel: "Repository URL",
    fields: [
      { key: "repoName", label: "Repository name", kind: "text", required: true, placeholder: "e.g. pal-billing-service" },
      { key: "visibility", label: "Visibility", kind: "select", required: true, options: ["Private", "Internal", "Public"] },
      { key: "stack", label: "Language / stack", kind: "text", placeholder: "e.g. Node.js, Next.js, Python" },
      { key: "purpose", label: "Purpose", kind: "textarea", required: true },
      { key: "access", label: "Who needs access", kind: "text", placeholder: "Names or team" },
      { key: "branchProtection", label: "Enable branch protection on main", kind: "checkbox" },
    ],
  },
  {
    value: "PULL_REQUEST", label: "Pull request review", blurb: "Ask someone to review or merge a pull request.", resultLabel: "Merged PR link",
    fields: [
      { key: "repository", label: "Repository", kind: "text", required: true },
      { key: "prUrl", label: "Pull request link", kind: "url", required: true },
      { key: "sourceBranch", label: "Source branch", kind: "text", required: true },
      { key: "targetBranch", label: "Target branch", kind: "text", required: true, placeholder: "main" },
      { key: "reviewType", label: "What you need", kind: "select", required: true, options: ["Code review", "Approve & merge", "Hotfix — urgent merge"] },
      { key: "changeSummary", label: "What changed", kind: "textarea", required: true },
      { key: "testing", label: "How it was tested", kind: "textarea" },
    ],
  },
  {
    value: "ACCESS_REQUEST", label: "Access request", blurb: "Request access to a system or tool.", resultLabel: "Access details",
    fields: [
      { key: "system", label: "System / tool", kind: "text", required: true },
      { key: "accessLevel", label: "Access level", kind: "select", required: true, options: ["Read only", "Read & write", "Admin"] },
      { key: "duration", label: "Duration", kind: "select", options: ["Permanent", "30 days", "7 days", "1 day"] },
      { key: "justification", label: "Why is it needed", kind: "textarea", required: true },
    ],
  },
  { value: "OTHER", label: "General request", blurb: "Anything else that needs an approval.", resultLabel: "Reference link", fields: [] },
];

export const REQUEST_TYPE_MAP = Object.fromEntries(REQUEST_TYPES.map((t) => [t.value, t])) as Record<string, RequestTypeDef>;

/** Validates + normalises form answers against the type's template. Returns { data } or { errors }. */
export function validateForm(type: string, raw: unknown): { data: Record<string, string | number | boolean> } | { errors: Record<string, string> } {
  const def = REQUEST_TYPE_MAP[type];
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const data: Record<string, string | number | boolean> = {};
  const errors: Record<string, string> = {};
  for (const f of def?.fields ?? []) {
    const v = input[f.key];
    const empty = v === undefined || v === null || v === "" || v === false;
    if (empty) {
      if (f.required && f.kind !== "checkbox") errors[f.key] = `${f.label} is required`;
      if (f.kind === "checkbox") data[f.key] = false;
      continue;
    }
    if (f.kind === "checkbox") data[f.key] = v === true;
    else if (f.kind === "number") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) errors[f.key] = `${f.label} must be a number`;
      else data[f.key] = n;
    } else {
      const s = String(v).trim().slice(0, f.kind === "textarea" ? 5000 : 500);
      if (f.kind === "select" && !f.options?.includes(s)) errors[f.key] = `Choose a valid ${f.label.toLowerCase()}`;
      else if (f.kind === "url" && !/^https?:\/\/\S+$/i.test(s)) errors[f.key] = `${f.label} must be a valid http(s) link`;
      else if (f.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(s)) errors[f.key] = `${f.label} must be a date`;
      else data[f.key] = s;
    }
  }
  return Object.keys(errors).length ? { errors } : { data };
}

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending", REJECTED: "Rejected", RESUBMITTED: "Resubmitted", APPROVED: "Approved", COMPLETE: "Complete", CANCELLED: "Cancelled",
};
