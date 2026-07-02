"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDownIcon, FileTextIcon, PencilIcon } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { Locale } from "@/shared/i18n/constants";
import { pluralForm } from "@/shared/i18n/plural";
import { recategorizeExpenseAction } from "../actions/recategorize-expense.action";
import type {
  ExpenseBreakdown as ExpenseBreakdownData,
  ExpenseBreakdownGroup,
  ExpenseTransactionRow,
  ExpenseCategoryOption,
  ExpenseContextOption,
} from "../queries/get-expense-breakdown";

type BreakdownLabels = Dictionary["money"]["breakdown"];

export function ExpenseBreakdown({
  breakdown,
  monthLabel,
  labels,
  locale,
}: {
  breakdown: ExpenseBreakdownData;
  monthLabel?: string;
  labels: BreakdownLabels;
  locale: Locale;
}) {
  if (breakdown.byCategory.length === 0 && breakdown.byContext.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">{labels.title}</h2>
        <p className="mt-1 text-xs text-text-muted">
          {labels.postedExpenses} · {monthLabel ?? breakdown.periodStart}. {labels.clickHint}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownCard
          title={labels.byCategory}
          groups={breakdown.byCategory}
          categoryOptions={breakdown.categoryOptions}
          contextOptions={breakdown.contextOptions}
          labels={labels}
          locale={locale}
        />
        <BreakdownCard
          title={labels.byContext}
          groups={breakdown.byContext}
          categoryOptions={breakdown.categoryOptions}
          contextOptions={breakdown.contextOptions}
          labels={labels}
          locale={locale}
        />
      </div>
    </section>
  );
}

function BreakdownCard({
  title,
  groups,
  categoryOptions,
  contextOptions,
  labels,
  locale,
}: {
  title: string;
  groups: ExpenseBreakdownGroup[];
  categoryOptions: ExpenseCategoryOption[];
  contextOptions: ExpenseContextOption[];
  labels: BreakdownLabels;
  locale: Locale;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="soft-card p-5">
      <h3 className="font-semibold text-text-primary">{title}</h3>
      <div className="mt-4 space-y-2">
        {groups.slice(0, 12).map((group) => {
          const isOpen = openId === group.id;
          return (
            <div key={group.id} className="rounded-(--neu-radius-md) border border-border">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : group.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-3 py-2 text-left"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <ChevronDownIcon
                    size={16}
                    className={`shrink-0 text-text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-secondary">{group.name}</p>
                    <p className="text-xs text-text-muted">
                      {group.transactionCount} {pluralForm(locale, group.transactionCount, labels.txCount)}
                    </p>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-semibold text-text-primary">
                  {formatAmount(group.amount, group.currency)}
                </p>
              </button>

              {isOpen && (
                <div className="space-y-2 border-t border-border px-3 py-3">
                  {group.transactions.map((tx) => (
                    <TransactionRow
                      key={tx.id}
                      tx={tx}
                      categoryOptions={categoryOptions}
                      contextOptions={contextOptions}
                      labels={labels}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TransactionRow({
  tx,
  categoryOptions,
  contextOptions,
  labels,
}: {
  tx: ExpenseTransactionRow;
  categoryOptions: ExpenseCategoryOption[];
  contextOptions: ExpenseContextOption[];
  labels: BreakdownLabels;
}) {
  const [editing, setEditing] = useState(false);
  const canEdit = categoryOptions.length > 0 && contextOptions.length > 0;

  return (
    <div className="rounded-(--neu-radius-sm) bg-surface-sunken px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary">{tx.title}</p>
          <p className="text-xs text-text-muted">{tx.date}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {tx.confidence != null && (
              <span className="text-xs text-text-muted">AI {Math.round(tx.confidence * 100)}%</span>
            )}
            {tx.method && <MethodBadge method={tx.method} labels={labels} />}
            {tx.sourceDocumentId && (
              <Link
                href={`${ROUTES.documents}/${tx.sourceDocumentId}`}
                className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary hover:underline"
              >
                <FileTextIcon size={12} /> {labels.source}
              </Link>
            )}
          </div>
          {tx.reason && <p className="mt-1 text-xs text-text-muted">{tx.reason}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="text-sm font-semibold text-text-primary">{formatAmount(tx.amount, tx.currency)}</p>
          {canEdit && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
            >
              <PencilIcon size={12} /> {labels.fixCategory}
            </button>
          )}
        </div>
      </div>

      {editing && canEdit && (
        <RecategorizeForm
          tx={tx}
          categoryOptions={categoryOptions}
          contextOptions={contextOptions}
          labels={labels}
          onDone={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function RecategorizeForm({
  tx,
  categoryOptions,
  contextOptions,
  labels,
  onDone,
}: {
  tx: ExpenseTransactionRow;
  categoryOptions: ExpenseCategoryOption[];
  contextOptions: ExpenseContextOption[];
  labels: BreakdownLabels;
  onDone: () => void;
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(tx.categoryId ?? categoryOptions[0]?.id ?? "");
  const [contextId, setContextId] = useState(tx.expenseContextId ?? contextOptions[0]?.id ?? "");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const result = await recategorizeExpenseAction({
        transactionId: tx.id,
        categoryId,
        expenseContextId: contextId,
        rememberChoice: remember,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="mt-2 grid gap-2 border-t border-border pt-2 sm:grid-cols-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{labels.category}</span>
        <select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          disabled={pending}
          className="rounded-(--neu-radius-sm) border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
        >
          {categoryOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{labels.context}</span>
        <select
          value={contextId}
          onChange={(event) => setContextId(event.target.value)}
          disabled={pending}
          className="rounded-(--neu-radius-sm) border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
        >
          {contextOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}{option.visibility === "private" ? ` · ${labels.private}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs text-text-secondary sm:col-span-2">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
          disabled={pending}
          className="h-4 w-4 rounded border-border"
        />
        {labels.remember}
      </label>
      <div className="flex items-center gap-2 sm:col-span-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !categoryId || !contextId}
          className="rounded-lg bg-accent-green px-3 py-1.5 text-xs font-semibold text-text-inverse disabled:opacity-60"
        >
          {pending ? labels.saving : labels.save}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-primary disabled:opacity-60"
        >
          {labels.cancel}
        </button>
        {error && <span role="alert" className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  );
}

function MethodBadge({ method, labels }: { method: string; labels: BreakdownLabels }) {
  const methods = labels.methods as Record<string, string>;
  return (
    <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
      {methods[method] ?? method}
    </span>
  );
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
