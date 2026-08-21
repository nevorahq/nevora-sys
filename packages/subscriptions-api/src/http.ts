import { z } from "zod";
import { BILLING_CYCLES, PAYMENT_CYCLE_STATUSES } from "@nevora/subscriptions-contracts";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// Loosely dated timestamp fields (created_at/updated_at/…) — not re-validated
// beyond "non-empty string", the same posture tasks-api takes for row fields
// that only round-trip through the wire and are never parsed by the caller.
const isoTimestamp = z.string().min(1);

export const SUBSCRIPTIONS_HTTP_ENDPOINT = "/api/internal/subscriptions" as const;
export const SUBSCRIPTIONS_HTTP_TRANSPORT_HEADER = "x-nevora-subscriptions-transport" as const;
export const SUBSCRIPTIONS_HTTP_TRANSPORT_VERSION = "subscriptions-v1" as const;

const subscriptionForPaymentInput = z.object({
  id: uuid,
  name: z.string().min(1),
  amount: z.number(),
  currency: z.string().length(3),
  billing_cycle: z.enum(BILLING_CYCLES),
  billing_anchor_day: z.number().int().min(1).max(31).nullable(),
  next_billing_date: isoDate,
  default_category_id: uuid.nullable(),
  auto_task_enabled: z.boolean(),
  is_active: z.boolean(),
  cancelled_at: isoTimestamp.nullable(),
  workspace_id: uuid.nullable(),
}).strict();

const paymentCycleInput = z.object({
  id: uuid,
  organization_id: uuid,
  workspace_id: uuid.nullable(),
  subscription_id: uuid,
  period_start: isoDate,
  period_end: isoDate,
  due_date: isoDate,
  billing_period_key: z.string().min(1),
  expected_amount: z.number(),
  currency: z.string().length(3),
  status: z.enum(PAYMENT_CYCLE_STATUSES),
  task_id: uuid.nullable(),
  transaction_id: uuid.nullable(),
  document_id: uuid.nullable(),
  idempotency_key: z.string().min(1),
  created_by: uuid.nullable(),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
  paid_at: isoTimestamp.nullable(),
  skipped_at: isoTimestamp.nullable(),
  cancelled_at: isoTimestamp.nullable(),
}).strict();

const createCycleInput = z.object({
  subscription: subscriptionForPaymentInput,
  dueDate: isoDate,
}).strict();

const createTaskInput = z.object({
  subscription: subscriptionForPaymentInput.pick({
    id: true,
    name: true,
    auto_task_enabled: true,
    workspace_id: true,
  }),
  cycle: paymentCycleInput,
}).strict();

export const subscriptionsHttpRequestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("getSubscriptions"), input: z.object({}).strict().optional().default({}) }).strict(),
  z.object({
    operation: z.literal("getPaymentCycleByTaskId"),
    input: z.object({ taskId: uuid }).strict(),
  }).strict(),
  z.object({
    operation: z.literal("getPaymentCycleByTransactionId"),
    input: z.object({ transactionId: uuid }).strict(),
  }).strict(),
  z.object({ operation: z.literal("createSubscriptionPaymentCycle"), input: createCycleInput }).strict(),
  z.object({ operation: z.literal("createSubscriptionPaymentTaskForCycle"), input: createTaskInput }).strict(),
]);

export type SubscriptionsHttpRequest = z.infer<typeof subscriptionsHttpRequestSchema>;
export type SubscriptionsHttpOperation = SubscriptionsHttpRequest["operation"];

export interface SubscriptionsHttpSuccess<T = unknown> {
  ok: true;
  data: T;
}

export interface SubscriptionsHttpFailure {
  ok: false;
  error: string;
  code?: string;
}

export type SubscriptionsHttpResponse<T = unknown> = SubscriptionsHttpSuccess<T> | SubscriptionsHttpFailure;

const READ_OPERATIONS: readonly SubscriptionsHttpOperation[] = [
  "getSubscriptions",
  "getPaymentCycleByTaskId",
  "getPaymentCycleByTransactionId",
];

export function isSubscriptionsWriteOperation(operation: SubscriptionsHttpOperation): boolean {
  return !READ_OPERATIONS.includes(operation);
}
