import { z } from "zod";
import {
  TASK_CONTEXT_TYPES,
  MAX_REMINDER_OFFSET_DAYS,
  DEFAULT_REMINDER_OFFSET_DAYS,
} from "../constants/task.constants";

const ISO_DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

// Context types a user can pick when confirming a detected obligation
// (everything except `standard`).
const FINANCIAL_CONTEXT_TYPES = TASK_CONTEXT_TYPES.filter((t) => t !== "standard") as [
  string,
  ...string[]
];

const reminderOffset = z
  .number()
  .int()
  .min(0)
  .max(MAX_REMINDER_OFFSET_DAYS)
  .default(DEFAULT_REMINDER_OFFSET_DAYS);

/**
 * Create/confirm a financial task from a detected obligation (spec §11 medium/high
 * confidence "confirm" path). organization_id/workspace_id are NEVER accepted here
 * — they come from the server context. amount/currency are the expected obligation,
 * not a posted transaction.
 */
export const createFinancialTaskSchema = z.object({
  contextType: z.enum(FINANCIAL_CONTEXT_TYPES),
  providerName: z.string().trim().max(200).nullable().default(null),
  amount: z.number().positive().max(1_000_000_000).nullable().default(null),
  currency: z.string().trim().length(3).nullable().default(null),
  financialDueDate: ISO_DATE,
  reminderOffsetDays: reminderOffset,
  // Optional source document that triggered the obligation.
  sourceDocumentId: z.string().uuid().nullable().default(null),
});
export type CreateFinancialTaskInput = z.infer<typeof createFinancialTaskSchema>;

/** Form-action wrapper: the document detail "Create task" button. */
export const createFinancialTaskFromDocumentSchema = createFinancialTaskSchema.extend({
  sourceDocumentId: z.string().uuid(),
});
export type CreateFinancialTaskFromDocumentInput = z.infer<
  typeof createFinancialTaskFromDocumentSchema
>;

/** Mark a one-off financial task as paid → posts exactly one expense. */
export const markFinancialTaskPaidSchema = z.object({
  taskId: z.string().uuid("Invalid task ID"),
  accountId: z.string().uuid("Select an account"),
  categoryId: z.string().uuid().nullable().default(null),
  paidDate: ISO_DATE.nullable().default(null),
});
export type MarkFinancialTaskPaidInput = z.infer<typeof markFinancialTaskPaidSchema>;

/** Skip this obligation (no money moves) — e.g. it was paid outside Business OS. */
export const skipFinancialTaskSchema = z.object({
  taskId: z.string().uuid("Invalid task ID"),
  reason: z.string().trim().max(500).nullable().default(null),
});
export type SkipFinancialTaskInput = z.infer<typeof skipFinancialTaskSchema>;

/** Dismiss a false-positive obligation. */
export const dismissFinancialTaskSchema = z.object({
  taskId: z.string().uuid("Invalid task ID"),
  reason: z.string().trim().max(500).nullable().default(null),
});
export type DismissFinancialTaskInput = z.infer<typeof dismissFinancialTaskSchema>;

/** Change the real payment date (and optionally the reminder offset). */
export const changeFinancialDueDateSchema = z.object({
  taskId: z.string().uuid("Invalid task ID"),
  financialDueDate: ISO_DATE,
  reminderOffsetDays: reminderOffset.optional(),
});
export type ChangeFinancialDueDateInput = z.infer<typeof changeFinancialDueDateSchema>;

/**
 * Set the amount/currency on an open financial task whose obligation was captured
 * without a number (e.g. "оплатить аренду 20 числа" — a real due date, no amount).
 * Records the planned obligation amount; it NEVER posts money — the expense is
 * still created only by Mark-as-paid. This closes the dead end where an amountless
 * task could never be paid.
 */
export const setFinancialTaskAmountSchema = z.object({
  taskId: z.string().uuid("Invalid task ID"),
  amount: z.number().positive("Enter an amount greater than zero").max(1_000_000_000),
  currency: z.string().trim().length(3, "Use a 3-letter currency code").toUpperCase(),
});
export type SetFinancialTaskAmountInput = z.infer<typeof setFinancialTaskAmountSchema>;
