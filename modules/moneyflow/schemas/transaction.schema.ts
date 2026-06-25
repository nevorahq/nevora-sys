import { z } from "zod";
import {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
  TRANSACTION_TITLE_MAX,
  TRANSACTION_NOTE_MAX,
  DEFAULT_CURRENCY,
} from "../constants/moneyflow.constants";

/**
 * Zod-схема для MoneyTransaction.
 *
 * Ключевые валидации:
 * - amount > 0 — тип операции хранится отдельно в `type`
 * - account_id обязателен — транзакция без счёта невозможна
 * - category_id опционален — пользователь может не категоризировать
 * - transaction_date — строка ISO date, default = сегодня
 *
 * Почему amount как string → transform → number:
 * HTML <input type="number"> отправляет значение как string в FormData.
 * Zod сначала получает string "250", парсит в число, затем валидирует.
 * coerce.number() делает это автоматически.
 */
export function getTransactionSchemas(errors: {
  titleRequired: string;
  amountRequired: string;
  amountPositive: string;
  invalidType: string;
  accountRequired: string;
  invalidDate: string;
}) {
  const createTransactionSchema = z.object({
    title: z
      .string()
      .min(1, errors.titleRequired)
      .max(TRANSACTION_TITLE_MAX),
    type: z.enum(TRANSACTION_TYPES, {
      error: errors.invalidType,
    }),
    amount: z
      .coerce
      .number({ error: errors.amountRequired })
      .positive(errors.amountPositive),
    account_id: z
      .string()
      .uuid(errors.accountRequired),
    category_id: z
      .string()
      .uuid()
      .nullable()
      .default(null),
    // Опциональная связь «эта транзакция оплачивает подписку».
    // Не хранится в money_transactions — уходит в payload события, а
    // on-transaction-created создаёт entity_link transaction --paid_by--> subscription.
    subscription_id: z
      .string()
      .uuid()
      .nullable()
      .default(null),
    // posted = фактическая (в балансе), planned = запланированная (прогноз).
    status: z
      .enum(TRANSACTION_STATUSES)
      .default("posted"),
    transaction_date: z
      .string()
      .min(1, errors.invalidDate)
      .default(() => new Date().toISOString().split("T")[0]),
    currency: z
      .string()
      .default(DEFAULT_CURRENCY),
    note: z
      .string()
      .max(TRANSACTION_NOTE_MAX)
      .nullable()
      .default(null),
  });

  const updateTransactionSchema = z.object({
    transactionId: z.string().uuid(),
    title: z.string().min(1, errors.titleRequired).max(TRANSACTION_TITLE_MAX),
    type: z.enum(TRANSACTION_TYPES, { error: errors.invalidType }),
    amount: z.coerce.number({ error: errors.amountRequired }).positive(errors.amountPositive),
    account_id: z.string().uuid(errors.accountRequired),
    category_id: z.string().uuid().nullable().default(null),
    transaction_date: z
      .string()
      .min(1, errors.invalidDate)
      .default(() => new Date().toISOString().split("T")[0]),
    note: z.string().max(TRANSACTION_NOTE_MAX).nullable().default(null),
  });

  return { createTransactionSchema, updateTransactionSchema };
}

type Schemas = ReturnType<typeof getTransactionSchemas>;
export type CreateTransactionData = z.infer<Schemas["createTransactionSchema"]>;
export type UpdateTransactionData = z.infer<Schemas["updateTransactionSchema"]>;
