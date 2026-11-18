import { z } from "zod";
import { sanitizeRich } from "./html";

const richCreate = z.string().max(50_000).transform((v) => sanitizeRich(v) || undefined);
const richUpdate = z.string().max(50_000).nullable().transform((v) => (v ? sanitizeRich(v) || null : null));

export const roleEnum = z.enum(["SUPER_ADMIN", "COMPANY_HEAD", "MANAGER", "LEAD", "STAFF"]);

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24h)");

const scheduleFields = {
  startTime: hhmm,
  endTime: hhmm,
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7), // 0=Sun
  requiredMinutes: z.number().int().min(1).max(1440).default(480),
  halfDayMinutes: z.number().int().min(1).max(1440).default(240),
  lateGraceMinutes: z.number().int().min(0).default(15),
  earlyGraceMinutes: z.number().int().min(0).default(15),
  paidLeavesPerYear: z.number().int().min(0).default(12),
};

export const scheduleSchema = z.object(scheduleFields).refine((s) => s.startTime < s.endTime, {
  message: "endTime must be after startTime",
  path: ["endTime"],
});

export const salarySchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3).default("INR"),
  effectiveFrom: z.string().date().optional(), // YYYY-MM-DD, defaults to today
  reason: z.string().max(255).optional(),
});

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: roleEnum.default("STAFF"),
  designation: z.string().max(100).optional(),
  schedule: scheduleSchema.optional(),
  salary: salarySchema.optional(),
  mailEmail: z.string().email().toLowerCase().optional(),
  mailPassword: z.string().min(1).optional(),
}).refine((v) => !!v.mailEmail === !!v.mailPassword, {
  message: "Provide both mailEmail and mailPassword",
  path: ["mailPassword"],
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  designation: z.string().max(100).nullable().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export const promoteSchema = z.object({
  role: roleEnum,
  designation: z.string().max(100).nullable().optional(),
  note: z.string().max(255).optional(),
});

export const leaveAddOnSchema = z.object({
  days: z.number().positive().max(365),
  year: z.number().int().min(2000).max(2100).optional(),
  reason: z.string().max(255).optional(),
});

// ───── Projects & tasks ─────
const date = z.string().date();

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(150), // the only required field
  description: richCreate.optional(),
  startDate: date.optional(),
  dueDate: date.optional(),
  memberIds: z.array(z.number().int().positive()).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  description: richUpdate.optional(),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]).optional(),
  startDate: date.nullable().optional(),
  dueDate: date.nullable().optional(),
});

export const addMemberSchema = z.object({ userId: z.number().int().positive() });

const priority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: richCreate.optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  dueDate: date.optional(),
  priority: priority.default("MEDIUM"),
  parentId: z.number().int().positive().optional(),
  /** Several people can work on one task, each with their own timer. Omitted = assign to yourself, [] = unassigned. */
  assigneeIds: z.array(z.number().int().positive()).max(20).optional(),
  /** legacy single-assignee form; assigneeIds wins when both are sent */
  assigneeId: z.number().int().positive().nullable().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: richUpdate.optional(),
  estimatedMinutes: z.number().int().positive().nullable().optional(),
  dueDate: date.nullable().optional(),
  priority: priority.optional(),
  /** Replaces the whole assignee set. People who have not started can be removed; new people can be added until the task is completed. */
  assigneeIds: z.array(z.number().int().positive()).max(20).optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
});

export const completeTaskSchema = z.object({
  /** If given, the task goes straight to IN_REVIEW with this reviewer */
  reviewerId: z.number().int().positive().optional(),
  note: z.string().max(500).optional(),
});

export const requestReviewSchema = z.object({
  reviewerId: z.number().int().positive(),
  note: z.string().max(500).optional(),
});

export const reviewTaskSchema = z
  .object({ decision: z.enum(["APPROVE", "REJECT"]), note: z.string().max(500).optional() })
  .refine((v) => v.decision === "APPROVE" || !!v.note?.trim(), { message: "note is required when rejecting", path: ["note"] });

export const mailboxSchema = z.object({
  mailEmail: z.string().email().toLowerCase(),
  mailPassword: z.string().min(1),
});

export const sendMailSchema = z.object({
  to: z.array(z.string().email()).min(1).max(20),
  cc: z.array(z.string().email()).max(20).optional(),
  subject: z.string().max(300).default(""),
  /** Sanitised HTML body from the rich-text editor */
  html: z.string().max(200_000),
});

export const leaveRequestSchema = z
  .object({
    type: z.enum(["PAID", "UNPAID"]).default("PAID"),
    startDate: z.string().date(),
    endDate: z.string().date(),
    halfDay: z.boolean().default(false),
    reason: z.string().max(190).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "endDate must be on or after startDate", path: ["endDate"] })
  .refine((v) => !v.halfDay || v.startDate === v.endDate, { message: "A half day must be a single date", path: ["halfDay"] });

export const leaveDecisionSchema = z
  .object({ decision: z.enum(["APPROVE", "REJECT"]), note: z.string().max(190).optional() })
  .refine((v) => v.decision === "APPROVE" || !!v.note?.trim(), { message: "note is required when rejecting", path: ["note"] });

// ───── Requests ─────
export const createRequestSchema = z.object({
  type: z.enum(["PROJECT_PLAN", "DEPLOYMENT", "REPO_CREATION", "PULL_REQUEST", "ACCESS_REQUEST", "OTHER"]),
  title: z.string().trim().min(3).max(190),
  description: richCreate.optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  assigneeId: z.number().int().positive(),
  projectId: z.number().int().positive().optional(),
  dueDate: z.string().date().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});

export const resubmitRequestSchema = z.object({
  title: z.string().trim().min(3).max(190).optional(),
  description: richUpdate.optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  dueDate: z.string().date().nullable().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  note: z.string().max(500).optional(),
});

export const requestActionSchema = z.object({
  note: z.string().trim().max(1000).optional(),
  resultUrl: z.string().url().max(500).optional(),
  assigneeId: z.number().int().positive().optional(),
});

// ───── Meetings ─────
const guestSchema = z.object({ email: z.string().trim().toLowerCase().email().max(190), name: z.string().trim().max(120).optional() });

export const meetingSchema = z
  .object({
    title: z.string().trim().min(2).max(190),
    agenda: richCreate.optional(),
    link: z.string().trim().url().max(500).optional().or(z.literal("").transform(() => undefined)),
    location: z.string().trim().max(190).optional(),
    /** ISO timestamps (the UI sends IST wall-clock converted to an instant) */
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    projectId: z.number().int().positive().nullable().optional(),
    attendeeIds: z.array(z.number().int().positive()).max(100).default([]),
    /** People outside PAL, invited by email (no account is created) */
    guests: z.array(guestSchema).max(50).default([]),
    leadId: z.number().int().positive().nullable().optional(),
    /** Lead meeting that is a product demo: moves the lead to DEMO_SCHEDULED */
    isDemo: z.boolean().optional(),
    /** Put it in the organiser's Google Calendar when connected (default on) */
    syncGoogle: z.boolean().default(true),
  })
  .refine((m) => new Date(m.endsAt) > new Date(m.startsAt), { message: "End time must be after the start time", path: ["endsAt"] });

export const meetingUpdateSchema = z.object({
  title: z.string().trim().min(2).max(190).optional(),
  agenda: richUpdate.optional(),
  link: z.string().trim().url().max(500).nullable().optional().or(z.literal("").transform(() => null)),
  location: z.string().trim().max(190).nullable().optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
  projectId: z.number().int().positive().nullable().optional(),
  attendeeIds: z.array(z.number().int().positive()).max(100).optional(),
  guests: z.array(guestSchema).max(50).optional(),
  leadId: z.number().int().positive().nullable().optional(),
});

export const rsvpSchema = z.object({ response: z.enum(["ACCEPTED", "DECLINED", "TENTATIVE"]) });

// ───────── Leads ─────────
const leadStage = z.enum(["NEW", "CONTACTED", "MQL", "SQL", "DEMO_SCHEDULED", "DEMO_DONE", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]);
const leadTemp = z.enum(["HOT", "WARM", "COLD"]);
const leadSource = z.enum(["WEBSITE", "SEARCH_ENGINE", "REFERRAL", "SOCIAL_MEDIA", "EMAIL_CAMPAIGN", "COLD_CALL", "EVENT", "PARTNER", "ADVERTISEMENT", "OTHER"]);
const followUpType = z.enum(["CALL", "EMAIL", "WHATSAPP", "MEETING", "OTHER"]);
const optText = (max: number) => z.string().trim().max(max).optional().or(z.literal("").transform(() => undefined));
const nullText = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => (v === "" ? null : v));

export const followUpSchema = z.object({
  type: followUpType.default("CALL"),
  dueAt: z.string().datetime({ offset: true }),
  note: optText(2000),
  /** Defaults to the lead owner */
  assigneeId: z.number().int().positive().optional(),
});

export const createLeadSchema = z.object({
  name: z.string().trim().min(1).max(190),
  company: optText(190),
  designation: optText(190),
  email: z.string().trim().toLowerCase().email().max(190).optional().or(z.literal("").transform(() => undefined)),
  phone: optText(40),
  website: optText(300),
  source: leadSource.default("OTHER"),
  stage: leadStage.default("NEW"),
  temperature: leadTemp.default("WARM"),
  value: z.number().nonnegative().max(1e12).optional(),
  currency: z.string().length(3).default("INR"),
  requirement: richCreate.optional(),
  tags: optText(300),
  ownerId: z.number().int().positive().optional(),
  firstFollowUp: followUpSchema.optional(),
});

export const updateLeadSchema = z.object({
  name: z.string().trim().min(1).max(190).optional(),
  company: nullText(190),
  designation: nullText(190),
  email: z.string().trim().toLowerCase().email().max(190).nullable().optional().or(z.literal("").transform(() => null)),
  phone: nullText(40),
  website: nullText(300),
  source: leadSource.optional(),
  value: z.number().nonnegative().max(1e12).nullable().optional(),
  currency: z.string().length(3).optional(),
  requirement: richUpdate.optional(),
  tags: nullText(300),
  ownerId: z.number().int().positive().optional(),
});

export const leadStageSchema = z
  .object({ stage: leadStage, note: optText(2000), lostReason: optText(2000) })
  .refine((v) => v.stage !== "LOST" || !!v.lostReason, { message: "Say why the lead was lost", path: ["lostReason"] });

export const leadTempSchema = z.object({ temperature: leadTemp, note: optText(2000) });

export const leadActivitySchema = z.object({
  type: z.enum(["NOTE", "CALL", "EMAIL", "WHATSAPP"]),
  note: z.string().trim().min(1).max(5000),
  /** Schedule the next touch-point in the same step */
  nextFollowUp: followUpSchema.optional(),
});

export const followUpActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("done"), outcome: optText(2000), nextFollowUp: followUpSchema.optional() }),
  z.object({ action: z.literal("cancel"), reason: optText(500) }),
  z.object({ action: z.literal("reschedule"), dueAt: z.string().datetime({ offset: true }), note: optText(500) }),
]);
