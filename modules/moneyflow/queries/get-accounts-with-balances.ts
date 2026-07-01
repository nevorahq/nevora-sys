import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { MoneyAccount } from "../types/moneyflow.types";

export type AccountWithBalance = MoneyAccount & {
  /** Live balance: initial_balance + income − expense ± transfers, in the account's currency. */
  balance: number;
};

/**
 * Query: активные счета + ВЫЧИСЛЕННЫЙ текущий баланс каждого.
 *
 * Баланс производный (нет колонки balance):
 *   balance = initial_balance
 *           + Σ(income на счёт)
 *           − Σ(expense со счёта)
 *           − Σ(transfer, где счёт = источник)
 *           + Σ(transfer, где счёт = получатель)
 *
 * Перевод (type='transfer') — одна строка с from_account_id/to_account_id:
 * списывает у источника и зачисляет получателю, поэтому здесь обрабатывается
 * отдельно от income/expense (account_id зеркалит источник — нельзя считать
 * дважды). Только posted и не удалённые строки попадают в баланс — те же
 * фильтры, что в get-money-summary и на странице счёта.
 *
 * RLS (is_org_member) scopes rows to any org the user belongs to — a user
 * can be active in more than one (multi-org, Phase 4.3), so we explicitly
 * filter by organizationId on top of RLS to isolate the selected org.
 */
export async function getAccountsWithBalances(organizationId: string): Promise<AccountWithBalance[]> {
  const supabase = await createClient();

  const [accountsResult, txResult] = await Promise.all([
    supabase
      .from("money_accounts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),

    supabase
      .from("money_transactions")
      .select("type, amount, account_id, from_account_id, to_account_id")
      .eq("organization_id", organizationId)
      .eq("status", "posted")
      .is("deleted_at", null),
  ]);

  if (accountsResult.error) {
    console.error("getAccountsWithBalances accounts error:", accountsResult.error);
    return [];
  }

  const accounts = (accountsResult.data ?? []) as MoneyAccount[];

  // accountId → дельта от транзакций (без initial_balance).
  const delta = new Map<string, number>();
  const bump = (id: string | null, value: number) => {
    if (!id) return;
    delta.set(id, (delta.get(id) ?? 0) + value);
  };

  if (txResult.error) {
    console.error("getAccountsWithBalances transactions error:", txResult.error);
  } else {
    for (const tx of txResult.data ?? []) {
      const amount = Number(tx.amount);
      if (tx.type === "transfer") {
        bump(tx.from_account_id, -amount);
        bump(tx.to_account_id, amount);
      } else if (tx.type === "income") {
        bump(tx.account_id, amount);
      } else {
        bump(tx.account_id, -amount);
      }
    }
  }

  return accounts.map((account) => ({
    ...account,
    balance: Number(account.initial_balance) + (delta.get(account.id) ?? 0),
  }));
}
