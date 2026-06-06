import { TrendingUpIcon, TrendingDownIcon, WalletIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/format-money";
import type { MoneySummary } from "../types/moneyflow.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/**
 * MoneySummaryCards — три карточки: баланс, доходы, расходы.
 *
 * Server Component — не нужен "use client".
 * Просто отображает данные, нет интерактивности.
 * 0 KB JavaScript на клиенте.
 *
 * Дизайн: neumorphic soft-card-sm с цветовыми акцентами:
 * - Баланс → accent-lilac (нейтральный)
 * - Доходы → accent-green (позитив)
 * - Расходы → accent-pink (внимание)
 */
interface MoneySummaryCardsProps {
  summary: MoneySummary;
  dict: Dictionary;
}

export function MoneySummaryCards({ summary, dict }: MoneySummaryCardsProps) {
  const cards = [
    {
      label: dict.money.summary.balance,
      value: summary.balance,
      icon: WalletIcon,
      accentBg: "bg-accent-lilac-soft",
      accentText: "text-accent-lilac",
    },
    {
      label: dict.money.summary.income,
      value: summary.monthlyIncome,
      icon: TrendingUpIcon,
      accentBg: "bg-accent-green-soft",
      accentText: "text-accent-green",
      prefix: "+",
    },
    {
      label: dict.money.summary.expenses,
      value: summary.monthlyExpenses,
      icon: TrendingDownIcon,
      accentBg: "bg-accent-pink-soft",
      accentText: "text-accent-pink",
      prefix: "−",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon;

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
            <p className="mt-3 text-2xl font-semibold text-text-primary tabular-nums">
              {card.prefix ?? ""}
              {formatMoney(card.value)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

