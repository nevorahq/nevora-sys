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
 * Give a freshly created organization one account in its base currency, so the
 * very first obligation can be marked as paid without a dead end.
 *
 * Deliberately **non-fatal and non-atomic**: it runs after `create_organization`
 * has committed, never inside it. A convenience account must not be able to roll
 * back org creation — migration 100 already proved how expensive that failure
 * mode is. If this returns false the user simply creates the account inline from
 * the obligation that needs it.
 *
 * It posts no money: an account with a zero initial balance is not a financial
 * fact, and payment still requires the explicit Mark-as-paid workflow.
 */
export async function seedDefaultMoneyAccount(
  supabase: SupabaseClient,
  input: { organizationId: string; userId: string; currency: string; name: string },
): Promise<boolean> {
  try {
    const { data: existing, error: existingError } = await supabase
      .from("money_accounts")
      .select("id")
      .eq("organization_id", input.organizationId)
      .is("deleted_at", null)
      .limit(1);

    if (existingError) {
      console.error("seedDefaultMoneyAccount lookup error:", existingError);
      return false;
    }
    if (existing && existing.length > 0) return false;

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("is_default", true)
      .maybeSingle();

    const { error } = await supabase.from("money_accounts").insert({
      organization_id: input.organizationId,
      workspace_id: workspace?.id ?? null,
      created_by: input.userId,
      updated_by: input.userId,
      name: input.name,
      type: "cash",
      initial_balance: 0,
      currency: input.currency,
      is_active: true,
    });

    if (error) {
      console.error("seedDefaultMoneyAccount insert error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("seedDefaultMoneyAccount unexpected error:", err);
    return false;
  }
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
