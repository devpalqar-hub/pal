import { z } from "zod";

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
  description: z.string().optional(),
  startDate: date.optional(),
  dueDate: date.optional(),
  memberIds: z.array(z.number().int().positive()).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]).optional(),
  startDate: date.nullable().optional(),
  dueDate: date.nullable().optional(),
});

export const addMemberSchema = z.object({ userId: z.number().int().positive() });

const priority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  dueDate: date.optional(),
  priority: priority.default("MEDIUM"),
  parentId: z.number().int().positive().optional(),
  /** omitted = assign to yourself, null = leave unassigned (project backlog) */
  assigneeId: z.number().int().positive().nullable().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  estimatedMinutes: z.number().int().positive().nullable().optional(),
  dueDate: date.nullable().optional(),
  priority: priority.optional(),
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
  text: z.string().max(100_000),
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
