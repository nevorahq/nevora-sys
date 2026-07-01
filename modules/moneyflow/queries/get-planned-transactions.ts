import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { MoneyTransactionWithRelations } from "../types/moneyflow.types";

/**
 * Query: запланированные (planned) транзакции — для секции «Запланированные»
 * на money-странице, где их можно «провести» (planned → posted) или удалить.
 *
 * Сортировка по дате по возрастанию: ближайшие предстоящие — сверху.
 *
 * RLS (is_org_member) допускает любую org пользователя — при active
 * membership в нескольких сразу (multi-org, Phase 4.3) явный фильтр по
 * organizationId обязателен поверх RLS.
 */
export async function getPlannedTransactions(organizationId: string): Promise<
  MoneyTransactionWithRelations[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("money_transactions")
    // money_accounts is referenced by 3 FKs now (account_id, from_account_id,
    // to_account_id) — disambiguate the embed by its FK column or PostgREST
    // errors with an ambiguous-relationship hint. Planned rows are never
    // transfers, so only the account_id side is needed.
    .select("*, account:money_accounts!account_id(name), category:money_categories(name)")
    .eq("organization_id", organizationId)
    .eq("status", "planned")
    // Exclude rejected/superseded drafts — reject + document re-extraction
    // soft-delete planned rows, which must not resurface as actionable.
    .is("deleted_at", null)
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getPlannedTransactions error:", error);
    return [];
  }

  return data as MoneyTransactionWithRelations[];
}
