import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { MoneyTransactionWithRelations } from "../types/moneyflow.types";

/**
 * Query: запланированные (planned) транзакции — для секции «Запланированные»
 * на money-странице, где их можно «провести» (planned → posted) или удалить.
 *
 * Сортировка по дате по возрастанию: ближайшие предстоящие — сверху.
 * RLS ограничивает выборку текущей организацией.
 */
export async function getPlannedTransactions(): Promise<
  MoneyTransactionWithRelations[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("money_transactions")
    .select("*, account:money_accounts(name), category:money_categories(name)")
    .eq("status", "planned")
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getPlannedTransactions error:", error);
    return [];
  }

  return data as MoneyTransactionWithRelations[];
}
