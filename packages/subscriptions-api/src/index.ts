import type {
  CreateSubscriptionPaymentCycleInput,
  CreateSubscriptionPaymentCycleResult,
  CreateSubscriptionPaymentTaskInput,
  CreateSubscriptionPaymentTaskResult,
  Subscription,
  SubscriptionPaymentCycle,
} from "@nevora/subscriptions-contracts";

/** Authenticated tenant identity resolved by a trusted transport adapter. */
export interface SubscriptionsRequestContext {
  organizationId: string;
  workspaceId: string;
  actorId: string;
  permissions: readonly string[];
}

/**
 * Bound server API for the Subscriptions product.
 *
 * The context is supplied by trusted server infrastructure, not by individual
 * method payloads. That prevents callers from selecting another organization
 * while keeping the interface usable by in-process and HTTP adapters.
 *
 * Scope: the cross-product surface other products and workflows actually call
 * today (Tasks' task detail page, Money's transaction pages, the platform
 * paid-obligation read port, and the document→subscription review flow) — not
 * the full internal `modules/subtracker/server` surface. Subscriptions' own
 * pages and its cron sweep keep using the in-process `/server` entrypoint
 * directly, the same way Tasks' own pages do not go through `TasksApplication`.
 */
export interface SubscriptionsApplication {
  readonly context: Readonly<SubscriptionsRequestContext>;

  getSubscriptions(): Promise<Subscription[]>;
  getPaymentCycleByTaskId(taskId: string): Promise<SubscriptionPaymentCycle | null>;
  getPaymentCycleByTransactionId(transactionId: string): Promise<SubscriptionPaymentCycle | null>;

  createSubscriptionPaymentCycle(
    input: CreateSubscriptionPaymentCycleInput,
  ): Promise<CreateSubscriptionPaymentCycleResult>;
  createSubscriptionPaymentTaskForCycle(
    input: CreateSubscriptionPaymentTaskInput,
  ): Promise<CreateSubscriptionPaymentTaskResult>;
}

/** A transport or deployment supplies one bound application per trusted context. */
export type SubscriptionsApplicationFactory = (
  context: SubscriptionsRequestContext,
) => SubscriptionsApplication | Promise<SubscriptionsApplication>;

export * from "./http";
export * from "./service-auth";
export * from "./execute";
