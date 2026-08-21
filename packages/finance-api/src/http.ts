import { z } from "zod";
import { ACCOUNT_TYPES } from "@nevora/finance-contracts";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const FINANCE_HTTP_ENDPOINT = "/api/internal/finance" as const;
export const FINANCE_HTTP_TRANSPORT_HEADER = "x-nevora-finance-transport" as const;
export const FINANCE_HTTP_TRANSPORT_VERSION = "finance-v1" as const;

const createAccountInput = z.object({
  name: z.string().trim().min(1),
  type: z.enum(ACCOUNT_TYPES),
  initialBalance: z.number(),
  currency: z.string().length(3),
  creationRequestId: uuid.optional(),
}).strict();

const findDuplicateInput = z.object({
  merchantName: z.string().nullable(),
  totalAmount: z.number().nullable(),
  currency: z.string().length(3).nullable(),
  transactionDate: isoDate.nullable(),
  excludeDocumentId: uuid.optional(),
}).strict();

export const financeHttpRequestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("getAccounts"), input: z.object({}).strict().optional().default({}) }).strict(),
  z.object({
    operation: z.literal("findActiveMoneyAccountsByCurrency"),
    input: z.object({ currency: z.string().length(3) }).strict(),
  }).strict(),
  z.object({ operation: z.literal("createMoneyAccount"), input: createAccountInput }).strict(),
  z.object({ operation: z.literal("findDuplicateTransaction"), input: findDuplicateInput }).strict(),
]);

export type FinanceHttpRequest = z.infer<typeof financeHttpRequestSchema>;
export type FinanceHttpOperation = FinanceHttpRequest["operation"];

export interface FinanceHttpSuccess<T = unknown> {
  ok: true;
  data: T;
}

export interface FinanceHttpFailure {
  ok: false;
  error: string;
  code?: string;
}

export type FinanceHttpResponse<T = unknown> = FinanceHttpSuccess<T> | FinanceHttpFailure;

const READ_OPERATIONS: readonly FinanceHttpOperation[] = [
  "getAccounts",
  "findActiveMoneyAccountsByCurrency",
  "findDuplicateTransaction",
];

export function isFinanceWriteOperation(operation: FinanceHttpOperation): boolean {
  return !READ_OPERATIONS.includes(operation);
}
