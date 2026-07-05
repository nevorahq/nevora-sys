import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Task } from "../types/task.types";
import type { FinancialTaskStatus } from "../constants/task.constants";

const FINANCIAL_TASK_COLUMNS =
  "id, organization_id, workspace_id, project_id, created_by, updated_by, title, description, status, priority, due_date, recurrence, recurrence_source_id, position, is_completed, created_at, updated_at, deleted_at, task_context_type, financial_due_date, reminder_offset_days, amount, currency, provider_name, financial_source_type, financial_source_id, source_document_id, financial_transaction_id, financial_status, financial_confidence, financial_paid_at, financial_skipped_at";

export interface GetFinancialTasksOptions {
  workspaceId?: string;
  /** Restrict to these financial statuses (default: open only). */
  financialStatus?: FinancialTaskStatus | FinancialTaskStatus[];
  limit?: number;
}

/**
 * Financial Context Tasks ordered by the date the user cares about
 * (financial_due_date, soonest first). Backs the "Financial Tasks" smart view.
 * RLS on `todos` is the tenant guard; the explicit organization_id pins the path.
 */
export async function getFinancialTasks(
  orgId: string,
  options: GetFinancialTasksOptions = {},
): Promise<Task[]> {
  const supabase = await createClient();

  let query = supabase
    .from("todos")
    .select(FINANCIAL_TASK_COLUMNS)
    .eq("organization_id", orgId)
    .neq("task_context_type", "standard")
    .is("deleted_at", null);

  if (options.workspaceId) query = query.eq("workspace_id", options.workspaceId);

  const statuses = options.financialStatus
    ? Array.isArray(options.financialStatus)
      ? options.financialStatus
      : [options.financialStatus]
    : (["open"] as FinancialTaskStatus[]);
  query = query.in("financial_status", statuses);

  query = query
    .order("financial_due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) {
    console.error("getFinancialTasks error:", error);
    return [];
  }
  return (data ?? []) as unknown as Task[];
}

export interface FinancialTaskSummary {
  open: number;
  overdue: number;
  dueSoon: number;
  totalOpenAmountByCurrency: Record<string, number>;
}

/**
 * Lightweight summary for the Financial Tasks header: how many open obligations,
 * how many overdue / due soon, and the total planned outflow per currency.
 * "Planned" — these are obligations, NOT posted transactions; they never touch
 * the actual Money balance.
 */
export async function getFinancialTaskSummary(
  orgId: string,
  workspaceId?: string,
): Promise<FinancialTaskSummary> {
  const open = await getFinancialTasks(orgId, { workspaceId, financialStatus: "open" });
  const today = new Date().toISOString().slice(0, 10);
  const soonCutoff = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const summary: FinancialTaskSummary = {
    open: open.length,
    overdue: 0,
    dueSoon: 0,
    totalOpenAmountByCurrency: {},
  };

  for (const task of open) {
    if (task.financial_due_date && task.financial_due_date < today) summary.overdue += 1;
    else if (task.financial_due_date && task.financial_due_date <= soonCutoff) summary.dueSoon += 1;
    if (task.amount != null && task.currency) {
      summary.totalOpenAmountByCurrency[task.currency] =
        (summary.totalOpenAmountByCurrency[task.currency] ?? 0) + task.amount;
    }
  }

  return summary;
}
