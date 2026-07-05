import { z } from "zod";
import { uuidSchema } from "@/lib/validators/common";

/** ISO calendar date (YYYY-MM-DD). */
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

export const markSubscriptionPaymentSchema = z.object({
  cycleId: uuidSchema,
  accountId: uuidSchema,
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
