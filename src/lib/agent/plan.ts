import { z } from "zod";

const priority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const id = z.number().int().positive();
const taskFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  priority: priority.optional(),
  dueDate: z.string().date().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  assigneeIds: z.array(id).max(20).optional(),
};

/** Steps the agent may propose. Nothing runs until the user approves the plan. */
export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_task"),
    projectId: id,
    ...taskFields,
    subtasks: z.array(z.object(taskFields)).max(15).optional(),
  }),
  z.object({ type: z.literal("assign_task"), taskId: id, addAssigneeIds: z.array(id).min(1).max(20) }),
  z.object({ type: z.literal("add_comment"), taskId: id, text: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal("start_task"), taskId: id }),
]);
export type Action = z.infer<typeof actionSchema>;

export const planSchema = z.object({ summary: z.string().max(1000), actions: z.array(actionSchema).min(1).max(25) });
