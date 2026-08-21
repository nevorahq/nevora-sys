import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceRequestContext } from "@nevora/finance-api";
import type {
  CreateMoneyAccountInput,
  CreateMoneyAccountResult,
  MoneyAccountOption,
} from "@nevora/finance-contracts";

/**
 * Insert a Money account using server-derived tenant attribution. A repeated
 * creationRequestId returns the row produced by the original request.
 *
 * Posts nothing: an account with a zero initial balance is not a financial
 * fact on its own — only the explicit Mark-as-paid workflow posts money.
 */
export async function createMoneyAccount(
  supabase: SupabaseClient,
  context: Readonly<FinanceRequestContext>,
  input: CreateMoneyAccountInput,
): Promise<CreateMoneyAccountResult> {
  const { data: account, error } = await supabase
    .from("money_accounts")
    .insert({
      organization_id: context.organizationId,
      workspace_id: context.workspaceId,
      created_by: context.actorId,
      updated_by: context.actorId,
      creation_request_id: input.creationRequestId ?? null,
      name: input.name,
      type: input.type,
      initial_balance: input.initialBalance,
      currency: input.currency,
      is_active: true,
    })
    .select("id, name, currency")
    .single();

  if (!error && account) {
    return { ok: true, account: account as MoneyAccountOption, created: true };
  }

  if (error?.code === "23505" && input.creationRequestId) {
    const { data: existing, error: lookupError } = await supabase
      .from("money_accounts")
      .select("id, name, currency")
      .eq("organization_id", context.organizationId)
      .eq("creation_request_id", input.creationRequestId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (!lookupError && existing && existing.currency === input.currency) {
      return { ok: true, account: existing as MoneyAccountOption, created: false };
    }

    return { ok: false, error: lookupError ?? error };
  }

  return { ok: false, error };
}
