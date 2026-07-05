import { WalletIcon, AlertTriangleIcon, ClockIcon } from "lucide-react";
import { requireOrg } from "@/lib/auth/require-org";
import { TasksSubnav } from "@/features/todos/components/tasks-subnav";
import { getFinancialTasks, getFinancialTaskSummary } from "@/modules/tasks/queries/get-financial-tasks";
import { FinancialTaskCard } from "@/modules/tasks/components/financial-task-card";
import { formatMoney } from "@/shared/utils/format-money";

/**
 * Financial Tasks smart view (spec §15). Upcoming payments, renewals, invoices
 * and tax reminders — everything with a real financial due date — ordered by
 * that date. These are PLANNED obligations: they never affect the actual Money
 * balance until Mark-as-paid posts an expense.
 */
export default async function FinancialTasksPage() {
  const { org } = await requireOrg();
  const [openTasks, summary] = await Promise.all([
    getFinancialTasks(org.id, { financialStatus: "open" }),
    getFinancialTaskSummary(org.id),
  ]);

  const totals = Object.entries(summary.totalOpenAmountByCurrency);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-text-primary">
          <WalletIcon size={22} className="text-accent-lilac" /> Financial Tasks
        </h1>
      </div>

      <div className="mt-5">
        <TasksSubnav />
      </div>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label="Open obligations" value={String(summary.open)} icon={<WalletIcon size={14} />} />
        <SummaryStat label="Overdue" value={String(summary.overdue)} icon={<AlertTriangleIcon size={14} />} tone={summary.overdue > 0 ? "danger" : undefined} />
        <SummaryStat label="Due within 7 days" value={String(summary.dueSoon)} icon={<ClockIcon size={14} />} />
        <SummaryStat
          label="Planned outflow"
          value={totals.length ? totals.map(([cur, amt]) => `${formatMoney(amt)} ${cur}`).join(" · ") : "—"}
        />
      </section>

      <section className="mt-6 space-y-3">
        {openTasks.length === 0 ? (
          <div className="soft-card p-8 text-center">
            <p className="text-sm text-text-muted">
              No open financial tasks. Upload an invoice or a renewal notice and Business OS will detect the obligation for you.
            </p>
          </div>
        ) : (
          openTasks.map((task) => <FinancialTaskCard key={task.id} task={task} />)
        )}
      </section>
    </>
  );
}

function SummaryStat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <div className="soft-card-sm p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">
        {icon}
        {label}
      </p>
      <p className={`mt-2 text-lg font-semibold ${tone === "danger" ? "text-danger" : "text-text-primary"}`}>{value}</p>
    </div>
  );
}
