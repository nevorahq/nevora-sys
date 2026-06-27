import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import type { AccountType } from "../constants/moneyflow.constants";

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

/**
 * Return active, non-deleted accounts in one currency for the organization.
 * Money accounts are organization-wide; workspace_id is attribution metadata.
 */
export async function findActiveMoneyAccountsByCurrency(
  supabase: SupabaseClient,
  organizationId: string,
  currency: string,
) {
  return supabase
    .from("money_accounts")
    .select("id, name, currency")
    .eq("organization_id", organizationId)
    .eq("currency", currency)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
}

/**
 * Insert a Money account using server-derived tenant attribution. A repeated
 * creationRequestId returns the row produced by the original request.
 */
export async function createMoneyAccount(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: CreateMoneyAccountInput,
): Promise<CreateMoneyAccountResult> {
  const { data: account, error } = await supabase
    .from("money_accounts")
    .insert({
      organization_id: ctx.org.id,
      workspace_id: ctx.workspace.id,
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
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
    return {
      ok: true,
      account: account as MoneyAccountOption,
      created: true,
    };
  }

  if (error?.code === "23505" && input.creationRequestId) {
    const { data: existing, error: lookupError } = await supabase
      .from("money_accounts")
      .select("id, name, currency")
      .eq("organization_id", ctx.org.id)
      .eq("creation_request_id", input.creationRequestId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (!lookupError && existing && existing.currency === input.currency) {
      return {
        ok: true,
        account: existing as MoneyAccountOption,
        created: false,
      };
    }

    return { ok: false, error: lookupError ?? error };
  }

  return { ok: false, error };
}
