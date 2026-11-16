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
});

export const rsvpSchema = z.object({ response: z.enum(["ACCEPTED", "DECLINED", "TENTATIVE"]) });
