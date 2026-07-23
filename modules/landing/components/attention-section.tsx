import { InboxIcon, BellIcon, CircleAlertIcon, CircleCheckIcon, type LucideIcon } from "lucide-react";
import type { AttentionId, LandingContent } from "../constants/landing-content";

/**
 * Модель внимания (`docs/contracts/attention-model.md`): четыре независимых
 * состояния сигнала. Иконки по стабильному `id`, а не по порядку — перевод не
 * может сдвинуть иконку. `Record<AttentionId, …>` роняет tsc, если состояние
 * добавили в контент, но забыли здесь.
 */
const ATTENTION_ICONS: Record<AttentionId, LucideIcon> = {
  captured: InboxIcon,
  informed: BellIcon,
  required: CircleAlertIcon,
  done: CircleCheckIcon,
};

export function AttentionSection({ content }: { content: LandingContent["attention"] }) {
  return (
    <section id="attention" className="bg-surface-sunken/40 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            {content.title}
          </h2>
          <p className="mt-3 text-pretty text-text-secondary">{content.subtitle}</p>
        </div>

        <ol className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {content.items.map((item, i) => {
            const Icon = ATTENTION_ICONS[item.id as AttentionId] ?? InboxIcon;
            return (
              <li
                key={item.id}
                className="nv-fade-up soft-card flex flex-col p-6"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-(--neu-radius-md) bg-surface-sunken text-text-primary shadow-neu-inset">
                    <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-4 font-semibold text-text-primary">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{item.text}</p>
              </li>
            );
          })}
        </ol>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm font-medium text-text-secondary">
          {content.closing}
        </p>
      </div>
    </section>
  );
}
