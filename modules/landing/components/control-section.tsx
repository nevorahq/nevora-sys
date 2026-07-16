import { SparklesIcon, WalletIcon, LockIcon } from "lucide-react";
import type { LandingContent } from "../constants/landing-content";

const POINT_ICONS = [SparklesIcon, WalletIcon, LockIcon] as const;

/** Контроль, безопасность и роль ИИ — почему решения остаются за пользователем. */
export function ControlSection({ content }: { content: LandingContent["control"] }) {
  return (
    <section id="control" className="bg-surface-sunken/40 py-16 sm:py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            {content.title}
          </h2>
          <p className="mt-3 text-pretty text-text-secondary">{content.subtitle}</p>
        </div>

        <div className="soft-card mt-12 divide-y divide-border-soft">
          {content.points.map((point, i) => {
            const Icon = POINT_ICONS[i] ?? SparklesIcon;
            return (
              <div key={point.title} className="flex items-start gap-4 p-6">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-(--neu-radius-md) bg-surface-sunken text-text-primary shadow-neu-inset">
                  <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-semibold text-text-primary">{point.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-text-secondary">{point.text}</p>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm font-medium text-text-secondary">
          {content.closing}
        </p>
      </div>
    </section>
  );
}
