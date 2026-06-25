import { TrendingUpIcon, TrendingDownIcon, WalletIcon, CalendarClockIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/format-money";
import type { MoneySummary } from "../types/moneyflow.types";
import type { UpcomingExpenses } from "../queries/get-upcoming-expenses";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/**
 * MoneySummaryCards — карточки баланса, доходов, расходов (+ прогноз).
 *
 * Server Component — нет интерактивности, 0 KB JS на клиенте.
 *
 * Мультивалютность: крупно показываем итог в БАЗОВОЙ валюте организации
 * (приведён через fn_get_exchange_rate), а под ним — разбивку по исходным
 * валютам. Если для какой-то валюты не нашёлся курс — итог помечается как
 * неполный (t.rateUnavailable).
 *
 * Дизайн: neumorphic soft-card-sm с цветовыми акцентами.
 */
/** Одна денежная величина в конкретной валюте. */
interface CurrencyAmount {
  currency: string;
  amount: number;
}

interface SummaryCard {
  label: string;
  /** Итог в базовой валюте — крупное значение. */
  primary: CurrencyAmount;
  /** Разбивка по исходным валютам — мелкие строки под итогом. */
  breakdown: CurrencyAmount[];
  /** true — для какой-то валюты нет курса, итог в базовой валюте неполный. */
  incomplete: boolean;
  icon: typeof WalletIcon;
  accentBg: string;
  accentText: string;
  prefix?: string;
  /** Доп. строки под значением (напр. «Прогноз баланса: …»). */
  subLines?: string[];
}

/** "EUR 1 200.00" — валюта явно. */
function formatAmount({ currency, amount }: CurrencyAmount): string {
  return currency ? `${currency} ${formatMoney(amount)}` : formatMoney(amount);
}

/**
 * Показывать разбивку, если итог реально собран из конвертаций:
 * больше одной валюты ИЛИ единственная валюта отличается от базовой.
 */
function shouldShowBreakdown(card: SummaryCard): boolean {
  if (card.breakdown.length > 1) return true;
  return (
    card.breakdown.length === 1 &&
    card.breakdown[0].currency !== card.primary.currency
  );
}

interface MoneySummaryCardsProps {
  summary: MoneySummary;
  dict: Dictionary;
  /**
   * Прогноз «Предстоящие расходы». Передаётся только на money-странице.
   * Если задан — добавляется 4-я карточка с прогнозом баланса.
   */
  upcoming?: UpcomingExpenses;
}

export function MoneySummaryCards({ summary, dict, upcoming }: MoneySummaryCardsProps) {
  const t = dict.money.summary;
  const rows = summary.byCurrency;
  const base = summary.base;

  // Селектор работает и над CurrencySummary, и над BaseSummary (общие поля).
  type Metric = { balance: number; monthlyIncome: number; monthlyExpenses: number };
  const makeCard = (
    label: string,
    sel: (m: Metric) => number,
    icon: typeof WalletIcon,
    accentBg: string,
    accentText: string,
    prefix?: string,
  ): SummaryCard => ({
    label,
    primary: { currency: base.currency, amount: sel(base) },
    breakdown: rows.map((r) => ({ currency: r.currency, amount: sel(r) })),
    incomplete: !base.complete,
    icon,
    accentBg,
    accentText,
    prefix,
  });

  const cards: SummaryCard[] = [
    makeCard(t.balance, (m) => m.balance, WalletIcon, "bg-accent-lilac-soft", "text-accent-lilac"),
    makeCard(t.income, (m) => m.monthlyIncome, TrendingUpIcon, "bg-accent-green-soft", "text-accent-green", "+"),
    makeCard(t.expenses, (m) => m.monthlyExpenses, TrendingDownIcon, "bg-accent-pink-soft", "text-accent-pink", "−"),
  ];

  if (upcoming) {
    // Прогноз баланса — в базовой валюте: projected = base.balance − upcoming(base).
    const projected = base.balance - upcoming.base.total;

    cards.push({
      label: t.upcoming,
      primary: { currency: upcoming.base.currency, amount: upcoming.base.total },
      breakdown: upcoming.byCurrency.map((u) => ({ currency: u.currency, amount: u.total })),
      incomplete: !upcoming.base.complete || !base.complete,
      icon: CalendarClockIcon,
      accentBg: "bg-accent-yellow-soft",
      accentText: "text-accent-yellow",
      prefix: "−",
      subLines: [
        `${t.projectedBalance}: ${formatAmount({ currency: base.currency, amount: projected })}`,
      ],
    });
  }

  const gridCols = upcoming ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3";

  return (
    <div className={cn("grid grid-cols-1 gap-4", gridCols)}>
      {cards.map((card) => {
        const Icon = card.icon;
        const showBreakdown = shouldShowBreakdown(card);

        return (
          <div key={card.label} className="soft-card-sm p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
                {card.label}
              </p>
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-(--neu-radius-md)",
                  card.accentBg,
                )}
              >
                <Icon size={18} className={card.accentText} strokeWidth={2} />
              </div>
            </div>

            {/* Итог в базовой валюте */}
            <p className="mt-3 text-2xl font-semibold text-text-primary tabular-nums">
              {card.prefix ?? ""}
              {formatAmount(card.primary)}
            </p>

            {/* Разбивка по исходным валютам */}
            {showBreakdown && (
              <div className="mt-1 space-y-0.5">
                {card.breakdown.map((amount) => (
                  <p
                    key={amount.currency || "_"}
                    className="text-xs font-medium text-text-muted tabular-nums"
                  >
                    {card.prefix ?? ""}
                    {formatAmount(amount)}
                  </p>
                ))}
              </div>
            )}

            {card.subLines?.map((subLine) => (
              <p
                key={subLine}
                className="mt-1 text-xs font-medium text-text-muted tabular-nums"
              >
                {subLine}
              </p>
            ))}

            {card.incomplete && (
              <p className="mt-1 text-xs font-medium text-accent-yellow">
                {t.rateUnavailable}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
