import { z } from "zod";
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
  dateRequired: string;
  invalidDate: string;
  accountRequired: string;
}) {
  const createSubscriptionSchema = z.object({
    name: z
      .string()
      .min(1, errors.nameRequired)
      .max(SUB_NAME_MAX),
    // Счёт списания для авто-транзакции (на подписке не хранится —
    // используется один раз при создании первой транзакции-расхода).
    account_id: z
      .string()
      .uuid(errors.accountRequired),
    amount: z
      .coerce
      .number({ error: errors.amountRequired })
      .positive(errors.amountPositive),
    currency: z
      .string()
      .default("MDL"),
    billing_cycle: z.enum(BILLING_CYCLES, {
      error: errors.invalidCycle,
    }),
    next_billing_date: z
      .string()
      .min(1, errors.dateRequired),
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
  });

  const updateSubscriptionSchema = z.object({
    subscriptionId: z.string().min(1),
    name: z.string().min(1, errors.nameRequired).max(SUB_NAME_MAX),
    amount: z.coerce.number({ error: errors.amountRequired }).positive(errors.amountPositive),
    billing_cycle: z.enum(BILLING_CYCLES, { error: errors.invalidCycle }),
    next_billing_date: z.string().min(1, errors.dateRequired),
    category: z.enum(SUB_CATEGORIES, { error: errors.invalidCategory }),
    url: z.string().max(SUB_URL_MAX).nullable().default(null),
    note: z.string().max(SUB_NOTE_MAX).nullable().default(null),
  });

  return { createSubscriptionSchema, updateSubscriptionSchema };
}

type Schemas = ReturnType<typeof getSubscriptionSchemas>;
export type CreateSubscriptionData = z.infer<Schemas["createSubscriptionSchema"]>;
export type UpdateSubscriptionData = z.infer<Schemas["updateSubscriptionSchema"]>;
