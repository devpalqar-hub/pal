const ROLES = ["SUPER_ADMIN", "COMPANY_HEAD", "MANAGER", "LEAD", "STAFF"];
const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
const json = (schema: any) => ({ "application/json": { schema } });
const idParam = { name: "id", in: "path", required: true, schema: { type: "integer" } };
const secure = [{ bearerAuth: [] }];
const std = { "401": { description: "Unauthorized" }, "403": { description: "Forbidden (role hierarchy)" } };

function op(tag: string, summary: string, o: { body?: any; res?: any; id?: boolean; query?: any[]; status?: string; auth?: boolean } = {}) {
  return {
    tags: [tag],
    summary,
    ...(o.auth !== false && { security: secure }),
    parameters: [...(o.id ? [idParam] : []), ...(o.query ?? [])],
    ...(o.body && { requestBody: { required: true, content: json(o.body) } }),
    responses: {
      [o.status ?? "200"]: { description: "OK", ...(o.res && { content: json(o.res) }) },
      "400": { description: "Validation error" },
      ...(o.auth !== false && std),
    },
  };
}

const q = (name: string, type = "string") => ({ name, in: "query", schema: { type } });
const int = { type: "integer" };
const str = { type: "string" };
const hhmm = { type: "string", example: "09:00" };

const schemas = {
  User: {
    type: "object",
    properties: {
      id: int, name: str, email: { type: "string", format: "email" },
      role: { type: "string", enum: ROLES },
      designation: { type: "string", nullable: true, example: "CEO" },
      isActive: { type: "boolean" }, createdAt: { type: "string", format: "date-time" },
    },
  },
  Schedule: {
    type: "object",
    required: ["startTime", "endTime", "workingDays"],
    properties: {
      startTime: hhmm, endTime: { ...hhmm, example: "18:00" },
      workingDays: { type: "array", items: int, example: [1, 2, 3, 4, 5], description: "0=Sunday ... 6=Saturday" },
      requiredMinutes: { ...int, default: 480, description: "Minutes needed for a full PRESENT day" },
      halfDayMinutes: { ...int, default: 240 },
      lateGraceMinutes: { ...int, default: 15 },
      earlyGraceMinutes: { ...int, default: 15 },
      paidLeavesPerYear: { ...int, default: 12 },
    },
  },
  SalaryInput: {
    type: "object",
    required: ["amount"],
    properties: {
      amount: { type: "number", example: 50000 }, currency: { type: "string", default: "INR" },
      effectiveFrom: { type: "string", format: "date", description: "Defaults to today" }, reason: str,
    },
  },
  CreateUser: {
    type: "object",
    required: ["name", "email", "password"],
    properties: {
      name: str, email: { type: "string", format: "email" }, password: { type: "string", minLength: 8 },
      role: { type: "string", enum: ROLES, default: "STAFF" }, designation: str,
      schedule: ref("Schedule"), salary: ref("SalaryInput"),
    },
  },
  Attendance: {
    type: "object",
    properties: {
      id: int, date: { type: "string", format: "date" },
      firstStartAt: { type: "string", format: "date-time", nullable: true },
      lastStopAt: { type: "string", format: "date-time", nullable: true },
      totalWorkMinutes: int, totalBreakMinutes: int,
      status: { type: "string", enum: ["IN_PROGRESS", "PRESENT", "HALF_DAY", "ABSENT"] },
      isLate: { type: "boolean" }, lateMinutes: int, isEarlyCheckout: { type: "boolean" }, earlyMinutes: int,
    },
  },
  WorkState: { type: "object", properties: { state: { type: "string", enum: ["NOT_STARTED", "WORKING", "PAUSED", "STOPPED"] }, attendance: ref("Attendance") } },
};

const users = (s: any) => ({ type: "object", properties: { user: s } });

const base = {
  openapi: "3.0.3",
  info: {
    title: "PAL API",
    version: "1.0.0",
    description:
      "Role hierarchy: SUPER_ADMIN > COMPANY_HEAD (CEO/CTO/CFO/Partner…) > MANAGER > LEAD > STAFF. " +
      "A user can only manage users ranked below them. Schedules/leaves need MANAGER+, salary needs COMPANY_HEAD+.",
  },
  servers: [{ url: "/" }],
  components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } }, schemas },
  paths: {
    "/api/auth/login": {
      post: op("Auth", "Log in and receive a JWT", {
        auth: false,
        body: { type: "object", required: ["email", "password"], properties: { email: str, password: str } },
        res: { type: "object", properties: { user: ref("User"), token: str } },
      }),
    },
    "/api/users": {
      get: op("Users", "List users below your role", { query: [q("role")], res: { type: "object", properties: { users: { type: "array", items: ref("User") } } } }),
      post: op("Users", "Create a user (optionally with schedule and salary)", { body: ref("CreateUser"), res: users(ref("User")), status: "201" }),
    },
    "/api/users/me": { get: op("Users", "Current user with schedule", { res: users(ref("User")) }) },
    "/api/users/{id}": {
      get: op("Users", "Get a user", { id: true, res: users(ref("User")) }),
      patch: op("Users", "Update name / designation / active flag / password", {
        id: true,
        body: { type: "object", properties: { name: str, designation: str, isActive: { type: "boolean" }, password: str } },
        res: users(ref("User")),
      }),
    },
    "/api/users/{id}/promote": {
      post: op("Users", "Promote or demote a user (recorded in role history)", {
        id: true,
        body: { type: "object", required: ["role"], properties: { role: { type: "string", enum: ROLES }, designation: str, note: str } },
        res: users(ref("User")),
      }),
    },
    "/api/users/{id}/role-history": { get: op("Users", "Role change history", { id: true }) },
    "/api/users/{id}/schedule": {
      get: op("Schedule", "Get work schedule", { id: true }),
      put: op("Schedule", "Set work schedule (times, working days, paid leave quota)", { id: true, body: ref("Schedule") }),
    },
    "/api/users/{id}/salary": {
      get: op("Salary", "Current salary and history (self or superior)", { id: true }),
      post: op("Salary", "Add a salary record — use for increments", { id: true, body: ref("SalaryInput"), status: "201" }),
    },
    "/api/users/{id}/leaves": {
      get: op("Leaves", "Paid leave entitlement (quota + add-ons) for a year", { id: true, query: [q("year", "integer")] }),
      post: op("Leaves", "Grant add-on paid leave", {
        id: true, status: "201",
        body: { type: "object", required: ["days"], properties: { days: { type: "number", example: 2 }, year: int, reason: str } },
      }),
    },
    "/api/attendance/start": { post: op("Attendance", "Start work for today", { res: ref("WorkState") }) },
    "/api/attendance/pause": { post: op("Attendance", "Pause (break)", { res: ref("WorkState") }) },
    "/api/attendance/resume": { post: op("Attendance", "Resume after pause", { res: ref("WorkState") }) },
    "/api/attendance/stop": { post: op("Attendance", "Stop work; finalises status, late and early-checkout flags", { res: ref("WorkState") }) },
    "/api/attendance/today": { get: op("Attendance", "Today's state and running totals", { res: ref("WorkState") }) },
    "/api/attendance": {
      get: op("Attendance", "Attendance history", {
        query: [q("userId", "integer"), q("from"), q("to")],
        res: { type: "object", properties: { days: { type: "array", items: ref("Attendance") } } },
      }),
    },
  },
};

const idp = (name: string) => ({ name, in: "path", required: true, schema: { type: "integer" } });
const TASK_STATUS = ["TODO", "IN_PROGRESS", "PAUSED", "COMPLETED", "IN_REVIEW", "ENDED"];
const taskRes = { type: "object", properties: { task: ref("Task") } };

const extraSchemas = {
  Project: {
    type: "object",
    properties: {
      id: int, name: str, description: { type: "string", nullable: true },
      status: { type: "string", enum: ["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] },
      startDate: { type: "string", format: "date", nullable: true }, dueDate: { type: "string", format: "date", nullable: true },
      ownerId: int,
    },
  },
  CreateProject: {
    type: "object",
    required: ["name"],
    description: "Only name is required.",
    properties: {
      name: str, description: str, startDate: { type: "string", format: "date" }, dueDate: { type: "string", format: "date" },
      memberIds: { type: "array", items: int },
    },
  },
  Task: {
    type: "object",
    properties: {
      id: int, projectId: int, parentId: { type: "integer", nullable: true }, title: str, description: { type: "string", nullable: true },
      priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
      status: { type: "string", enum: TASK_STATUS },
      estimatedMinutes: { type: "integer", nullable: true }, workedMinutes: int, workedSeconds: int, isTimerRunning: { type: "boolean" },
      dueDate: { type: "string", format: "date", nullable: true },
      createdById: int, assigneeId: { type: "integer", nullable: true }, reviewerId: { type: "integer", nullable: true },
      startedAt: { type: "string", format: "date-time", nullable: true }, completedAt: { type: "string", format: "date-time", nullable: true },
      endedAt: { type: "string", format: "date-time", nullable: true },
    },
  },
  CreateTask: {
    type: "object",
    required: ["title"],
    description: "assigneeId omitted = assign to yourself; null = unassigned. parentId makes it a sub-task.",
    properties: {
      title: str, description: str, estimatedMinutes: int, dueDate: { type: "string", format: "date" },
      priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"], default: "MEDIUM" },
      parentId: int, assigneeId: { type: "integer", nullable: true },
    },
  },
};

const extraPaths = {
  "/api/projects": {
    get: op("Projects", "List projects you can see", { query: [q("status")], res: { type: "object", properties: { projects: { type: "array", items: ref("Project") } } } }),
    post: op("Projects", "Create a project (COMPANY_HEAD / MANAGER). Name is the only required field", { body: ref("CreateProject"), status: "201", res: { type: "object", properties: { project: ref("Project") } } }),
  },
  "/api/projects/{id}": {
    get: op("Projects", "Project with members, task counts per status and progress %", { id: true }),
    patch: op("Projects", "Update project / change status (project managers)", {
      id: true,
      body: { type: "object", properties: { name: str, description: str, status: { type: "string", enum: ["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] }, startDate: str, dueDate: str } },
    }),
  },
  "/api/projects/{id}/members": {
    post: op("Projects", "Add a member to the project", { id: true, status: "201", body: { type: "object", required: ["userId"], properties: { userId: int } } }),
  },
  "/api/projects/{id}/members/{userId}": {
    delete: { ...op("Projects", "Remove a member (blocked while they have open tasks)"), parameters: [idp("id"), idp("userId")] },
  },
  "/api/projects/{id}/tasks": {
    get: op("Tasks", "List tasks in a project", {
      id: true, query: [q("status"), q("assigneeId", "integer"), q("parentId")],
      res: { type: "object", properties: { tasks: { type: "array", items: ref("Task") } } },
    }),
    post: op("Tasks", "Create a task or sub-task (assign to a member or yourself)", { id: true, body: ref("CreateTask"), status: "201", res: taskRes }),
  },
  "/api/tasks/me": { get: op("Tasks", "My tasks across projects (?role=reviewer for my review queue)", { query: [q("status"), q("role")] }) },
  "/api/tasks/{id}": {
    get: op("Tasks", "Task with sub-tasks and full activity log", { id: true, res: taskRes }),
    patch: op("Tasks", "Edit details / reassign (creator or project manager; anyone can self-assign an unassigned task)", {
      id: true,
      body: { type: "object", properties: { title: str, description: str, estimatedMinutes: int, dueDate: str, priority: str, assigneeId: { type: "integer", nullable: true } } },
      res: taskRes,
    }),
    delete: op("Tasks", "Delete a task and its sub-tasks", { id: true }),
  },
  "/api/tasks/{id}/start": { post: op("Task workflow", "Start / resume the timer (assignee only, one running task at a time)", { id: true, res: taskRes }) },
  "/api/tasks/{id}/pause": { post: op("Task workflow", "Pause the timer", { id: true, res: taskRes }) },
  "/api/tasks/{id}/complete": {
    post: op("Task workflow", "Mark complete (assignee only). Optional reviewerId sends it straight to review", {
      id: true, body: { type: "object", properties: { reviewerId: int, note: str } }, res: taskRes,
    }),
  },
  "/api/tasks/{id}/request-review": {
    post: op("Task workflow", "Send a COMPLETED task to a person for review", {
      id: true, body: { type: "object", required: ["reviewerId"], properties: { reviewerId: int, note: str } }, res: taskRes,
    }),
  },
  "/api/tasks/{id}/review": {
    post: op("Task workflow", "Reviewer decision: APPROVE → ENDED, REJECT → back to assignee (note required)", {
      id: true, body: { type: "object", required: ["decision"], properties: { decision: { type: "string", enum: ["APPROVE", "REJECT"] }, note: str } }, res: taskRes,
    }),
  },
  "/api/tasks/{id}/end": { post: op("Task workflow", "Mark a COMPLETED task as ENDED (creator or project manager)", { id: true, res: taskRes }) },
};

const leaveBody = {
  type: "object", required: ["startDate", "endDate"],
  properties: { type: { type: "string", enum: ["PAID", "UNPAID"], default: "PAID" }, startDate: { type: "string", format: "date" }, endDate: { type: "string", format: "date" }, halfDay: { type: "boolean" }, reason: str },
};
const notifyPaths = {
  "/api/notifications": { get: op("Notifications", "My notifications + unread count (?filter=unread, ?category=task|leave, ?limit, ?before=<id>)", { query: [q("filter"), q("category"), q("limit", "integer"), q("before", "integer")] }) },
  "/api/notifications/read": { post: op("Notifications", "Mark read by ids, taskId, or all", { body: { type: "object", properties: { ids: { type: "array", items: int }, taskId: int, all: { type: "boolean" } } } }) },
  "/api/notifications/preferences": { put: op("Notifications", "Turn email copies on/off", { body: { type: "object", required: ["emailEnabled"], properties: { emailEnabled: { type: "boolean" } } } }) },
};

const mailPaths = {
  "/api/leaves": {
    get: op("Leave", "My leave requests (?scope=team for requests you can approve, ?status=)", { query: [q("scope"), q("status")] }),
    post: op("Leave", "Request leave. Working days are counted from the schedule; paid leave is checked against the balance", { body: leaveBody, status: "201" }),
  },
  "/api/leaves/{id}/decision": {
    post: op("Leave", "Approve / reject (MANAGER+ above the requester; note required on reject)", { id: true, body: { type: "object", required: ["decision"], properties: { decision: { type: "string", enum: ["APPROVE", "REJECT"] }, note: str } } }),
  },
  "/api/leaves/{id}/cancel": { post: op("Leave", "Withdraw your own pending request", { id: true }) },
  "/api/mail/inbox": { get: op("Mail", "Inbox from mail.palqar.com (?limit=, ?before=<uid> for older). Polled by the browser every 2 minutes", { query: [q("limit", "integer"), q("before", "integer")] }) },
  "/api/mail/messages/{uid}": { get: op("Mail", "Read a message (marks it read)", { id: false, query: [{ name: "uid", in: "path", required: true, schema: { type: "integer" } }] }) },
  "/api/mail/messages/{uid}/attachments/{index}": {
    get: { ...op("Mail", "Download an attachment"), parameters: [{ name: "uid", in: "path", required: true, schema: { type: "integer" } }, { name: "index", in: "path", required: true, schema: { type: "integer" } }] },
  },
  "/api/mail/send": {
    post: {
      ...op("Mail", "Send an email with optional attachments (multipart/form-data; max 10 files, 20 MB)"),
      requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["to", "text"], properties: { to: { type: "string", description: "comma separated" }, cc: str, subject: str, text: str, files: { type: "array", items: { type: "string", format: "binary" } } } } } } },
    },
  },
  "/api/users/{id}/mailbox": {
    put: op("Mail", "Link a mailbox (verified against the server, stored encrypted)", { id: true, body: { type: "object", required: ["mailEmail", "mailPassword"], properties: { mailEmail: str, mailPassword: str } } }),
    delete: op("Mail", "Unlink the mailbox", { id: true }),
  },
};

export const openApiSpec = {
  ...base,
  components: { ...base.components, schemas: { ...base.components.schemas, ...extraSchemas } },
  paths: { ...base.paths, ...extraPaths, ...mailPaths, ...notifyPaths },
};
