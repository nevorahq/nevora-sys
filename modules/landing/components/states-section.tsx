import { cn } from "@/shared/utils/cn";
import {
  CANONICAL_FINANCIAL_STATES,
  type CanonicalFinancialState,
} from "@/modules/moneyflow/lib/canonical-financial-state";
import { STATE_STYLE } from "@/modules/moneyflow/components/financial-state-badge";
import type { LandingContent } from "../constants/landing-content";

/**
 * Единый финансовый словарь. Подписи состояний берутся из словаря приложения
 * (`dict.money.states`), а цвета — из того же `STATE_STYLE`, что и бейджи внутри
 * продукта. Лендинг не хранит собственных копий — то, что видит посетитель, это
 * буквально то, что он увидит на экранах после входа.
 */
export function StatesSection({
  content,
  labels,
}: {
  content: LandingContent["states"];
  /** `dict.money.states` — одна подпись на каждое каноническое состояние. */
  labels: Record<CanonicalFinancialState, string>;
}) {
  const textById = new Map(content.items.map((item) => [item.id, item.text]));

  return (
    <section id="states" className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          {content.title}
        </h2>
        <p className="mt-3 text-pretty text-text-secondary">{content.subtitle}</p>
      </div>

      {/* Порядок — канонический путь (`CANONICAL_FINANCIAL_STATES`), а не порядок
          в контенте: строки соединяются по id, поэтому подпись, цвет и описание
          не могут разъехаться. */}
      <ol className="mt-12 flex flex-col gap-px overflow-hidden rounded-(--neu-radius-lg) border border-border-soft bg-border-soft shadow-neu-sm">
        {CANONICAL_FINANCIAL_STATES.map((state) => (
          <li key={state} className="flex items-start gap-4 bg-surface p-5 sm:items-center">
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                STATE_STYLE[state],
              )}
            >
              {labels[state]}
            </span>
            <p className="text-sm leading-relaxed text-text-secondary">{textById.get(state)}</p>
          </li>
        ))}
      </ol>

      <p className="mx-auto mt-8 max-w-2xl text-center text-sm font-medium text-text-secondary">
        {content.note}
      </p>
    </section>
  );
}
