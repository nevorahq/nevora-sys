import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceApplication, FinanceRequestContext } from "@nevora/finance-api";
import { createMoneyAccount } from "./mutations";
import { findActiveMoneyAccountsByCurrency, findDuplicateTransaction, getAccounts } from "./queries";

export interface FinanceRuntimeDependencies {
  supabase: SupabaseClient;
  context: Readonly<FinanceRequestContext>;
}

/** Supabase-backed implementation shared by the root adapter and a future standalone Finance app. */
export function createFinanceRuntimeApplication(
  dependencies: FinanceRuntimeDependencies,
): FinanceApplication {
  const { supabase, context } = dependencies;
  return {
    context,
    getAccounts: () => getAccounts(supabase, context.organizationId),
    findActiveMoneyAccountsByCurrency: (currency) =>
      findActiveMoneyAccountsByCurrency(supabase, context.organizationId, currency),
    createMoneyAccount: (input) => createMoneyAccount(supabase, context, input),
    findDuplicateTransaction: (input) =>
      findDuplicateTransaction(supabase, context.organizationId, input),
  };
}
