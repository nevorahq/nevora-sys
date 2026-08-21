import type { AccountType } from "./money-constants";

/** Minimal account shape returned to callers that only need id/name/currency. */
export type MoneyAccountOption = {
  id: string;
  name: string;
  currency: string;
};

export type CreateMoneyAccountInput = {
  name: string;
  type: AccountType;
  initialBalance: number;
  currency: string;
  creationRequestId?: string;
};

export type CreateMoneyAccountResult =
  | { ok: true; account: MoneyAccountOption; created: boolean }
  | { ok: false; error: unknown };

/** Server Action result shape for the inline "create account" prompt. */
export type InlineAccountCreationResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  account?: MoneyAccountOption;
  created?: boolean;
};
