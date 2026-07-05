import Link from "next/link";
import { CalendarClockIcon, FileTextIcon } from "lucide-react";
import { formatMoney } from "@/shared/utils/format-money";
import { formatDate } from "@/shared/utils/format-date";
import { ROUTES } from "@/shared/config/routes";
import { TASK_CONTEXT_TYPE_LABELS } from "../constants/task.constants";
import type { Task } from "../types/task.types";

/**
 * Compact card for the Financial Tasks view (spec §15). Read-only summary —
 * actions live on the task detail page. Highlights overdue obligations in red.
 */
export function FinancialTaskCard({ task }: { task: Task }) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = task.financial_status === "open" && !!task.financial_due_date && task.financial_due_date < today;

  return (
    <Link
      href={`${ROUTES.tasks}/${task.id}`}
      className="soft-card block p-4 transition-shadow hover:shadow-neu-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">{task.title}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {TASK_CONTEXT_TYPE_LABELS[task.task_context_type]}
            {task.provider_name ? ` · ${task.provider_name}` : ""}
          </p>
        </div>
        {task.amount != null && (
          <span className="shrink-0 text-sm font-semibold text-text-primary">
            {formatMoney(Number(task.amount))} {task.currency ?? ""}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
        <span className={`inline-flex items-center gap-1 ${overdue ? "text-danger" : ""}`}>
          <CalendarClockIcon size={13} />
          Pay {task.financial_due_date ? formatDate(task.financial_due_date) : "—"}
          {overdue ? " · overdue" : ""}
        </span>
        <span className="text-text-muted">Action by {task.due_date ? formatDate(task.due_date) : "—"}</span>
        {task.source_document_id && (
          <span className="inline-flex items-center gap-1 text-text-muted">
            <FileTextIcon size={13} /> Document
          </span>
        )}
      </div>
    </Link>
  );
}
