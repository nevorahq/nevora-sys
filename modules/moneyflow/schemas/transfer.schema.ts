import { z } from "zod";
import {
  TRANSACTION_NOTE_MAX,
  DEFAULT_CURRENCY,
} from "../constants/moneyflow.constants";

/**
 * Zod-схема для перевода средств между счетами (Internal Transfer).
 *
 * Перевод — это НЕ income/expense и НЕ категория, а отдельная операция
 * (type='transfer'). Схема валидирует только входные данные формы; равенство
 * валют и существование счетов проверяет action, т.к. это требует запроса в БД.
 *
 * Ключевые правила (MVP):
 * - from_account_id / to_account_id обязательны и должны различаться
 * - amount > 0
 * - currency проверяется по факту в action (одинаковая у обоих счетов)
 */
export function getTransferSchema(errors: {
  fromAccountRequired: string;
  toAccountRequired: string;
  sameAccount: string;
  amountRequired: string;
  amountPositive: string;
  invalidDate: string;
}) {
  return z
    .object({
      from_account_id: z.string().uuid(errors.fromAccountRequired),
      to_account_id: z.string().uuid(errors.toAccountRequired),
      amount: z
        .coerce
        .number({ error: errors.amountRequired })
        .positive(errors.amountPositive),
      transaction_date: z
        .string()
        .min(1, errors.invalidDate)
        .default(() => new Date().toISOString().split("T")[0]),
      note: z
        .string()
        .max(TRANSACTION_NOTE_MAX)
        .nullable()
        .default(null),
      // Не выбирается пользователем — проставляется из валюты счёта в action.
      currency: z.string().default(DEFAULT_CURRENCY),
    })
    .refine((data) => data.from_account_id !== data.to_account_id, {
      path: ["to_account_id"],
      message: errors.sameAccount,
    });
}

type TransferSchema = ReturnType<typeof getTransferSchema>;
export type CreateTransferData = z.infer<TransferSchema>;
