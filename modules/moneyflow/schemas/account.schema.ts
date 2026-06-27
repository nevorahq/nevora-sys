import { z } from "zod";
import {
  ACCOUNT_TYPES,
  ACCOUNT_NAME_MAX,
  DEFAULT_CURRENCY,
  MONEY_ACCOUNT_CURRENCIES,
} from "../constants/moneyflow.constants";

/**
 * Zod-схема для MoneyAccount.
 *
 * initial_balance: z.coerce.number() — HTML form отправляет string,
 * coerce автоматически парсит "5000" → 5000.
 */
export function getAccountSchemas(errors: {
  nameRequired: string;
  invalidType: string;
}) {
  const createAccountSchema = z.object({
    name: z
      .string()
      .min(1, errors.nameRequired)
      .max(ACCOUNT_NAME_MAX),
    type: z.enum(ACCOUNT_TYPES, {
      error: errors.invalidType,
    }),
    initial_balance: z
      .coerce
      .number()
      .default(0),
    currency: z.enum(MONEY_ACCOUNT_CURRENCIES).default(DEFAULT_CURRENCY),
  });

  const updateAccountSchema = z.object({
    accountId: z.string().uuid(),
    name: z.string().min(1, errors.nameRequired).max(ACCOUNT_NAME_MAX),
    type: z.enum(ACCOUNT_TYPES, { error: errors.invalidType }),
    initial_balance: z.coerce.number(),
  });

  return { createAccountSchema, updateAccountSchema };
}

type Schemas = ReturnType<typeof getAccountSchemas>;
export type CreateAccountData = z.infer<Schemas["createAccountSchema"]>;
export type UpdateAccountData = z.infer<Schemas["updateAccountSchema"]>;
