import { createClient } from "@/lib/supabase/server";
import { UNLIMITED } from "@/modules/billing";
import type { UsageMetric } from "@/modules/billing";

/**
 * Проверяет, не превышен ли лимит плана для данной метрики.
 * Возвращает { allowed: true } если действие разрешено,
 * { allowed: false, reason } если лимит исчерпан.
 *
 * Использовать перед операциями create в modules/*.
 *
 * @param amount сколько единиц метрики добавит операция (по умолчанию 1).
 *   Для storage_mb передаётся размер загружаемого файла в МБ.
 *
 * Семантика блокировки: операция запрещена, если `used + amount > limit`.
 * Для счётных метрик amount=1 эквивалентно прежнему `used >= limit`.
 *
 * Moneyflow и Subtracker используют organization_id, поэтому все trial
 * limits can be enforced from one server-side entry point.
 */
export async function checkPlanLimit(
  organizationId: string,
  metric: UsageMetric,
  amount = 1,
): Promise<{ allowed: boolean; reason?: string }> {
  const supabase = await createClient();

  // Keep error messages friendly. The matching RLS guard in migration 027 is
  // still authoritative for every direct database mutation.
  const { data: writable } = await supabase.rpc("is_organization_writable", {
    p_organization_id: organizationId,
  });
  if (writable === false) {
    return { allowed: false, reason: "Your trial has ended. Choose a plan to continue editing." };
  }

  // Получаем подписку + план одним запросом
  const { data: subRaw } = await supabase
    .from("billing_subscriptions")
    .select(
      "status, plan:plans!plan_id(" +
        "max_members, max_workspaces, max_tasks, max_deals, max_clients, " +
        "max_documents, max_subscriptions, max_money_transactions, " +
        "max_ai_calls_mo, max_storage_mb" +
      ")",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  const sub = subRaw as unknown as {
    status: string;
    plan: Record<string, number> | null;
  } | null;

  if (!sub || !sub.plan) return { allowed: true }; // нет подписки — не блокируем

  if (sub.status === "canceled") {
    return { allowed: false, reason: "Subscription is canceled" };
  }

  const plan = sub.plan;
  const limitMap: Record<UsageMetric, string> = {
    members:            "max_members",
    workspaces:         "max_workspaces",
    tasks:              "max_tasks",
    deals:              "max_deals",
    clients:            "max_clients",
    documents:          "max_documents",
    subscriptions:      "max_subscriptions",
    money_transactions: "max_money_transactions",
    ai_calls:           "max_ai_calls_mo",
    storage_mb:         "max_storage_mb",
  };

  const limit = plan[limitMap[metric]] ?? UNLIMITED;
  if (limit === UNLIMITED) return { allowed: true };

  const blocked = (used: number): { allowed: boolean; reason?: string } => ({
    allowed: false,
    reason:  `Plan limit reached: ${used}/${limit} ${metric}. Upgrade your plan to add more.`,
  });

  // ── AI-запросы за текущий месяц. The request ledger counts actual calls,
  // not output rows (one request can create many insights or update a summary).
  if (metric === "ai_calls") {
    const monthStart = startOfMonthISO();
    const { count } = await supabase
      .from("ai_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", monthStart);
    const used = count ?? 0;
    return used + amount > limit ? blocked(used) : { allowed: true };
  }

  // ── Спец-метрика: storage (сумма размеров файлов, байты → МБ)
  if (metric === "storage_mb") {
    const { data: rows } = await supabase
      .from("document_attachments")
      .select("file_size")
      .eq("organization_id", organizationId);

    const usedBytes = (rows ?? []).reduce(
      (sum, r) => sum + (((r as { file_size: number | null }).file_size) ?? 0),
      0,
    );
    const usedMb = usedBytes / (1024 * 1024);
    return usedMb + amount > limit ? blocked(Math.ceil(usedMb)) : { allowed: true };
  }

  // ── Счётные метрики: live COUNT по таблице модуля
  const tableMap: Record<string, string> = {
    members:    "memberships",
    workspaces: "workspaces",
    tasks:      "todos",
    deals:      "crm_deals",
    clients:    "crm_clients",
    documents:  "documents",
    subscriptions: "subscriptions",
    money_transactions: "money_transactions",
  };

  const table = tableMap[metric];
  if (!table) return { allowed: true };

  const filterDeleted = ["tasks", "deals", "clients", "documents", "workspaces"].includes(metric);
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (metric === "members") {
    // active + invited: pending-invite держит место в лимите плана
    query = query.in("status", ["active", "invited"]) as typeof query;
  }
  if (filterDeleted) {
    query = query.is("deleted_at", null) as typeof query;
  }

  const { count } = await query;
  const used = count ?? 0;

  return used + amount > limit ? blocked(used) : { allowed: true };
}

/** ISO-строка начала текущего месяца (для месячных метрик типа AI). */
function startOfMonthISO(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
