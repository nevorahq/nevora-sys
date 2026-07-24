import {
  ShieldCheckIcon,
  RepeatIcon,
  BellOffIcon,
  BotIcon,
  LockIcon,
  EyeOffIcon,
  type LucideIcon,
} from "lucide-react";
import type { ProofId, LandingContent } from "../constants/landing-content";

/**
 * «Как мы это доказываем» — безопасность как проверяемые инварианты, а не бейджи.
 * Каждая гарантия привязана к контрактному тесту (docs/contracts/* +
 * test/release-invariants). Иконки по стабильному `id`: `Record<ProofId, …>`
 * роняет tsc, если гарантию добавили в контент, но забыли иконку.
 */
const PROOF_ICONS: Record<ProofId, LucideIcon> = {
  money: ShieldCheckIcon,
  idempotent: RepeatIcon,
  notifications: BellOffIcon,
  ai: BotIcon,
  isolation: LockIcon,
  privacy: EyeOffIcon,
};

export function ProofSection({ content }: { content: LandingContent["proof"] }) {
  return (
    <section id="proof" className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          {content.title}
        </h2>
        <p className="mt-3 text-pretty text-text-secondary">{content.subtitle}</p>
      </div>

      <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {content.items.map((item, i) => {
          const Icon = PROOF_ICONS[item.id as ProofId] ?? ShieldCheckIcon;
          return (
            <li
              key={item.id}
              className="nv-fade-up soft-card flex flex-col p-6"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-(--neu-radius-md) bg-surface-sunken text-accent-green shadow-neu-inset">
                <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-semibold text-text-primary">{item.claim}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{item.how}</p>
            </li>
          );
        })}
      </ul>

      <p className="mx-auto mt-8 max-w-2xl text-center text-sm font-medium text-text-secondary">
        {content.closing}
      </p>
    </section>
  );
}
