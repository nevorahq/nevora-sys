import { SparklesIcon, TagIcon, StoreIcon, TrendingUpIcon } from "lucide-react";
import { formatMoney } from "@/shared/utils/format-money";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { CategoryIntelligence, MoneyAmount } from "../queries/get-category-intelligence";

interface CategoryIntelligenceCardsProps {
  data: CategoryIntelligence;
  labels: Dictionary["money"]["intelligence"]["analytics"];
}

/**
 * Minimal category analytics (Phase 5, spec §12.5) matching the existing
 * soft-card UI: uncategorized total, source split, top merchants, income by
 * category. Expenses-by-category lives in the ExpenseBreakdown next to it.
 */
export function CategoryIntelligenceCards({ data, labels }: CategoryIntelligenceCardsProps) {
  const hasAnything =
    data.uncategorized.count > 0 ||
    data.topMerchants.length > 0 ||
    data.incomeByCategory.length > 0 ||
    data.sources.manual + data.sources.rules + data.sources.ai > 0;

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wider">
        {labels.title}
      </h2>

      {!hasAnything ? (
        <div className="soft-card p-5 text-sm text-text-muted">{labels.noData}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="soft-card-sm p-4">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
              <TagIcon size={13} /> {labels.uncategorized}
            </p>
            <p className="mt-2 text-lg font-semibold text-text-primary">
              {data.uncategorized.amounts.length > 0 ? <Amounts amounts={data.uncategorized.amounts} /> : "0"}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {labels.transactionsCount.replace("{count}", String(data.uncategorized.count))}
            </p>
          </div>

          <div className="soft-card-sm p-4">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
              <SparklesIcon size={13} /> {labels.aiCategorized}
            </p>
            <p className="mt-2 text-lg font-semibold text-text-primary">{data.sources.ai}</p>
            <p className="mt-1 text-xs text-text-muted">
              {labels.manualCategorized}: {data.sources.manual} · {labels.ruleCategorized}: {data.sources.rules}
            </p>
          </div>

          <div className="soft-card-sm p-4">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
              <StoreIcon size={13} /> {labels.topMerchants}
            </p>
            <ul className="mt-2 space-y-1.5">
              {data.topMerchants.length === 0 && <li className="text-xs text-text-muted">—</li>}
              {data.topMerchants.map((merchant) => (
                <li key={merchant.merchant} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-text-primary">{merchant.merchant}</span>
                  <span className="shrink-0 text-xs font-medium text-text-secondary">
                    <Amounts amounts={merchant.amounts} />
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="soft-card-sm p-4">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
              <TrendingUpIcon size={13} /> {labels.incomeByCategory}
            </p>
            <ul className="mt-2 space-y-1.5">
              {data.incomeByCategory.length === 0 && <li className="text-xs text-text-muted">—</li>}
              {data.incomeByCategory.map((entry) => (
                <li key={entry.categoryId ?? "none"} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-text-primary">{entry.name}</span>
                  <span className="shrink-0 text-xs font-medium text-accent-green">
                    <Amounts amounts={entry.amounts} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function Amounts({ amounts }: { amounts: MoneyAmount[] }) {
  return (
    <>
      {amounts
        .map((entry) => `${entry.currency} ${formatMoney(entry.amount)}`)
        .join(" + ")}
    </>
  );
}
