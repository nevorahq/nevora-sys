import type { Plan } from "@/modules/billing";

export const ACCOUNT_ROLES = ["user", "developer", "admin", "owner"] as const;

export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export type AccountLimits = {
  maxWorkspaces: number | null;
  maxMembers: number | null;
  maxTasks: number | null;
  maxClients: number | null;
  maxDeals: number | null;
  maxDocuments: number | null;
  maxSubscriptions: number | null;
  maxMoneyTransactions: number | null;
  maxStorageMb: number | null;
  maxAiRequestsPerMonth: number | null;
  unlimitedAccess: boolean;
  accountRole: AccountRole;
};

export type AccountAccessProfile = {
  account_role: AccountRole | null;
  unlimited_access: boolean | null;
};

type PlanLimits = Pick<
  Plan,
  | "max_workspaces"
  | "max_members"
  | "max_tasks"
  | "max_clients"
  | "max_deals"
  | "max_documents"
  | "max_subscriptions"
  | "max_money_transactions"
  | "max_storage_mb"
  | "max_ai_calls_mo"
>;

const normalizeLimit = (value: number | undefined): number | null =>
  value === undefined || value === -1 ? null : value;

export function buildAccountLimits(
  profile: AccountAccessProfile | null,
  plan: PlanLimits | null,
): AccountLimits {
  const accountRole = profile?.account_role ?? "user";
  const unlimitedAccess = profile?.unlimited_access === true;

  if (unlimitedAccess) {
    return {
      maxWorkspaces: null,
      maxMembers: null,
      maxTasks: null,
      maxClients: null,
      maxDeals: null,
      maxDocuments: null,
      maxSubscriptions: null,
      maxMoneyTransactions: null,
      maxStorageMb: null,
      maxAiRequestsPerMonth: null,
      unlimitedAccess: true,
      accountRole,
    };
  }

  return {
    maxWorkspaces: normalizeLimit(plan?.max_workspaces),
    maxMembers: normalizeLimit(plan?.max_members),
    maxTasks: normalizeLimit(plan?.max_tasks),
    maxClients: normalizeLimit(plan?.max_clients),
    maxDeals: normalizeLimit(plan?.max_deals),
    maxDocuments: normalizeLimit(plan?.max_documents),
    maxSubscriptions: normalizeLimit(plan?.max_subscriptions),
    maxMoneyTransactions: normalizeLimit(plan?.max_money_transactions),
    maxStorageMb: normalizeLimit(plan?.max_storage_mb),
    maxAiRequestsPerMonth: normalizeLimit(plan?.max_ai_calls_mo),
    unlimitedAccess: false,
    accountRole,
  };
}
