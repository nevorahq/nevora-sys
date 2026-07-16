import { z } from "zod";
import {
  TRANSACTION_NOTE_MAX,
} from "../constants/moneyflow.constants";

const moneyAmountSchema = (required: string, positive: string) =>
  z.string().trim().min(1, required).regex(/^\d+(?:\.\d{1,2})?$/, required).refine(
    (value) => Number(value) > 0,
    positive,
  );

/**
 * Zod-схема для перевода средств между счетами (Internal Transfer).
 *
 * Перевод — это НЕ income/expense и НЕ категория, а отдельная операция
 * (type='transfer'). Схема валидирует только входные данные формы; валюты,
 * счета, reference rate и округление повторно проверяет DB RPC/trigger.
 *
 * Ключевые правила (MVP):
 * - from_account_id / to_account_id обязательны и должны различаться
 * - amount > 0
 * - destination_amount опционален: resolver рассчитает его, если курс найден
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
      amount: moneyAmountSchema(errors.amountRequired, errors.amountPositive),
      destination_amount: z.union([
        moneyAmountSchema(errors.amountRequired, errors.amountPositive),
        z.literal(""),
      ]).optional().transform((value) => value || null),
      use_custom_destination: z.enum(["yes", "no"]).default("no"),
      transaction_date: z
        .string()
        .min(1, errors.invalidDate)
        .default(() => new Date().toISOString().split("T")[0]),
      note: z
        .string()
        .max(TRANSACTION_NOTE_MAX)
        .nullable()
        .default(null),
    })
    .superRefine((data, ctx) => {
      if (data.from_account_id === data.to_account_id) {
        ctx.addIssue({
          code: "custom",
          path: ["to_account_id"],
          message: errors.sameAccount,
        });
      }
      if (data.use_custom_destination === "yes" && !data.destination_amount) {
        ctx.addIssue({
          code: "custom",
          path: ["destination_amount"],
          message: errors.amountRequired,
        });
      }
    });
}

type TransferSchema = ReturnType<typeof getTransferSchema>;
export type CreateTransferData = z.infer<TransferSchema>;
