import { z } from "zod";
import {
  DEFAULT_BASE_CURRENCY,
  SUPPORTED_CURRENCIES,
} from "@/shared/config/currencies";
import {
  BILLING_CYCLES,
  SUB_CATEGORIES,
  SUB_NAME_MAX,
  SUB_NOTE_MAX,
  SUB_URL_MAX,
} from "../constants/subtracker.constants";

export function getSubscriptionSchemas(errors: {
  nameRequired: string;
  amountRequired: string;
  amountPositive: string;
  invalidCycle: string;
  invalidCategory: string;
  invalidCurrency: string;
  dateRequired: string;
  invalidDate: string;
  dateInPast?: string;
  invalidReminderDays?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const reminderDaysSchema = z.preprocess(
    (value) => value === "" || value === "never" || value == null ? null : value,
    z.coerce.number().int().min(1, errors.invalidReminderDays).max(180, errors.invalidReminderDays).nullable(),
  );
  const createSubscriptionSchema = z.object({
    name: z
      .string()
      .min(1, errors.nameRequired)
      .max(SUB_NAME_MAX),
    amount: z
      .coerce
      .number({ error: errors.amountRequired })
      .positive(errors.amountPositive),
    currency: z.enum(SUPPORTED_CURRENCIES, {
      error: errors.invalidCurrency,
    }).default(DEFAULT_BASE_CURRENCY),
    billing_cycle: z.enum(BILLING_CYCLES, {
      error: errors.invalidCycle,
    }),
    next_billing_date: z
      .string()
      .min(1, errors.dateRequired)
      .refine((date) => date >= today, errors.dateInPast ?? errors.invalidDate),
    category: z.enum(SUB_CATEGORIES, {
      error: errors.invalidCategory,
    }),
    url: z
      .string()
      .max(SUB_URL_MAX)
      .nullable()
      .default(null),
    note: z
      .string()
      .max(SUB_NOTE_MAX)
      .nullable()
      .default(null),
    auto_renews: z.enum(["true", "false"]).transform((value) => value === "true"),
    renewal_reminder_days: reminderDaysSchema,
  });

  const updateSubscriptionSchema = z.object({
    subscriptionId: z.string().min(1),
    name: z.string().min(1, errors.nameRequired).max(SUB_NAME_MAX),
    amount: z.coerce.number({ error: errors.amountRequired }).positive(errors.amountPositive),
    currency: z.enum(SUPPORTED_CURRENCIES, { error: errors.invalidCurrency }),
    billing_cycle: z.enum(BILLING_CYCLES, { error: errors.invalidCycle }),
    next_billing_date: z.string().min(1, errors.dateRequired).refine(
      (date) => date >= today,
      errors.dateInPast ?? errors.invalidDate,
    ),
    category: z.enum(SUB_CATEGORIES, { error: errors.invalidCategory }),
    url: z.string().max(SUB_URL_MAX).nullable().default(null),
    note: z.string().max(SUB_NOTE_MAX).nullable().default(null),
    auto_renews: z.enum(["true", "false"]).transform((value) => value === "true"),
    renewal_reminder_days: reminderDaysSchema,
  });

  return { createSubscriptionSchema, updateSubscriptionSchema };
}

type Schemas = ReturnType<typeof getSubscriptionSchemas>;
export type CreateSubscriptionData = z.infer<Schemas["createSubscriptionSchema"]>;
export type UpdateSubscriptionData = z.infer<Schemas["updateSubscriptionSchema"]>;
