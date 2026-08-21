import { z } from "zod";

// Inlined rather than importing the root app's shared `uuidSchema` — portable
// packages cannot depend on the `@/` alias. Same message, same validation.
const uuidSchema = z.string().uuid("Invalid ID format");

/** ISO calendar date (YYYY-MM-DD). */
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

export const markSubscriptionPaymentSchema = z.object({
  cycleId: uuidSchema,
  paidDate: isoDateSchema.optional(),
});

export const skipSubscriptionPaymentSchema = z.object({
  cycleId: uuidSchema,
});

export const changeSubscriptionPaymentDueDateSchema = z.object({
  cycleId: uuidSchema,
  newDueDate: isoDateSchema,
});

export const cancelSubscriptionSchema = z.object({
  subscriptionId: uuidSchema,
});

export type MarkSubscriptionPaymentInput = z.infer<typeof markSubscriptionPaymentSchema>;
export type SkipSubscriptionPaymentInput = z.infer<typeof skipSubscriptionPaymentSchema>;
export type ChangeSubscriptionPaymentDueDateInput = z.infer<typeof changeSubscriptionPaymentDueDateSchema>;
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
