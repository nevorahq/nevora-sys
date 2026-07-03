import type { NotificationPriority } from "../types";

export type ReminderSourceType = "task" | "subscription" | "payment" | "document";

export interface ReminderMilestone {
  trigger: string;
  offset: number;
  unit: "days" | "hours";
  priority: NotificationPriority;
}

const TASK_DEFAULT: readonly ReminderMilestone[] = [
  { trigger: "due-minus-3d", offset: -3, unit: "days", priority: "high" },
  { trigger: "due-minus-1d", offset: -1, unit: "days", priority: "high" },
  { trigger: "due-today", offset: 0, unit: "days", priority: "critical" },
  { trigger: "overdue-plus-1d", offset: 1, unit: "days", priority: "critical" },
];

const TASK_HIGH: readonly ReminderMilestone[] = [
  { trigger: "due-minus-7d", offset: -7, unit: "days", priority: "normal" },
  ...TASK_DEFAULT,
  { trigger: "overdue-plus-3d", offset: 3, unit: "days", priority: "critical" },
];

export const REMINDER_POLICY = {
  task: { default: TASK_DEFAULT, high: TASK_HIGH },
  subscription: [
    { trigger: "due-minus-7d", offset: -7, unit: "days", priority: "normal" },
    { trigger: "due-minus-3d", offset: -3, unit: "days", priority: "high" },
    { trigger: "due-minus-1d", offset: -1, unit: "days", priority: "high" },
    { trigger: "due-today", offset: 0, unit: "days", priority: "critical" },
    { trigger: "overdue-plus-1d", offset: 1, unit: "days", priority: "critical" },
    { trigger: "overdue-plus-3d", offset: 3, unit: "days", priority: "critical" },
  ],
  payment: [
    { trigger: "due-minus-3d", offset: -3, unit: "days", priority: "high" },
    { trigger: "due-minus-1d", offset: -1, unit: "days", priority: "high" },
    { trigger: "due-today", offset: 0, unit: "days", priority: "critical" },
    { trigger: "overdue-plus-1d", offset: 1, unit: "days", priority: "critical" },
  ],
  document: [
    { trigger: "review-now", offset: 0, unit: "hours", priority: "normal" },
    { trigger: "review-plus-24h", offset: 24, unit: "hours", priority: "normal" },
    { trigger: "review-plus-72h", offset: 72, unit: "hours", priority: "high" },
  ],
} as const;

export function taskReminderPolicy(priority: string): readonly ReminderMilestone[] {
  return priority === "high" ? REMINDER_POLICY.task.high : REMINDER_POLICY.task.default;
}

export function reminderIdempotencyKey(input: {
  sourceType: ReminderSourceType;
  sourceId: string;
  recipientUserId: string;
  trigger: string;
  sourceDate: string;
}): string {
  return `${input.sourceType}:${input.sourceId}:${input.recipientUserId}:${input.trigger}:${input.sourceDate}`;
}
