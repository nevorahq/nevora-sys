import type {
  CreateMoneyAccountInput,
  CreateMoneyAccountResult,
  DuplicateTransactionMatch,
  FindActiveMoneyAccountsResult,
  FindDuplicateTransactionInput,
  MoneyAccount,
} from "@nevora/finance-contracts";

/** Authenticated tenant identity resolved by a trusted transport adapter. */
export interface FinanceRequestContext {
  organizationId: string;
  workspaceId: string;
  actorId: string;
  permissions: readonly string[];
}

/**
 * Bound server API for the Finance (Money) product.
 *
 * The context is supplied by trusted server infrastructure, not by individual
 * method payloads. That prevents callers from selecting another organization
 * while keeping the interface usable by in-process and HTTP adapters.
 *
 * Scope: the cross-product surface other products and workflows actually call
 * today (Tasks' and Subscriptions' pages reading the account list, the
 * inline obligation-account-creation workflow, and the document review flow's
 * duplicate check) — not the full internal `modules/moneyflow/server` surface.
 * Money's own pages, its suggestions-sweep cron, onboarding's
 * `seedDefaultMoneyAccount` (called before a workspace/permissions context
 * exists — it doesn't fit this port's bound-context shape), and the expense
 * classification subsystem (`classifyExpense`/`upsertPrivateMerchantRule` —
 * larger, deliberately deferred) all keep using the in-process `/server`
 * entrypoint directly, the same tier as Tasks' own pages relative to
 * `TasksApplication`.
 */
export interface FinanceApplication {
  readonly context: Readonly<FinanceRequestContext>;

  getAccounts(): Promise<MoneyAccount[]>;
  findActiveMoneyAccountsByCurrency(currency: string): Promise<FindActiveMoneyAccountsResult>;
  createMoneyAccount(input: CreateMoneyAccountInput): Promise<CreateMoneyAccountResult>;
  findDuplicateTransaction(input: FindDuplicateTransactionInput): Promise<DuplicateTransactionMatch>;
}

/** A transport or deployment supplies one bound application per trusted context. */
export type FinanceApplicationFactory = (
  context: FinanceRequestContext,
) => FinanceApplication | Promise<FinanceApplication>;

export * from "./http";
export * from "./service-auth";
export * from "./execute";
