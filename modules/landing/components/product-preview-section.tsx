import {
  HomeIcon,
  CheckSquareIcon,
  WalletIcon,
  FileTextIcon,
  InboxIcon,
  SettingsIcon,
  PlusIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import {
  type CanonicalFinancialState,
} from "@/modules/moneyflow/lib/canonical-financial-state";
import { STATE_STYLE } from "@/modules/moneyflow/components/financial-state-badge";
import type { LandingContent } from "../constants/landing-content";

/**
 * «Взгляд внутрь» — иллюстративный фрейм рабочего пространства Money на реальной
 * дизайн-системе. НЕ фотография и не реальный аккаунт: подпись это проговаривает,
 * данные примерные. Но словарь настоящий — навигация из `dict.nav`, а бейджи
 * состояний берут подпись из `dict.money.states` и цвет из того же `STATE_STYLE`,
 * что и внутри продукта, поэтому превью не «рисованное», а собранное из реальных
 * элементов интерфейса.
 */

export interface PreviewNavLabels {
  home: string;
  work: string;
  money: string;
  documents: string;
  inbox: string;
  settings: string;
}

const NAV: Array<{ key: keyof PreviewNavLabels; icon: LucideIcon; active?: boolean }> = [
  { key: "home", icon: HomeIcon },
  { key: "work", icon: CheckSquareIcon },
  { key: "money", icon: WalletIcon, active: true },
  { key: "documents", icon: FileTextIcon },
  { key: "inbox", icon: InboxIcon },
  { key: "settings", icon: SettingsIcon },
];

export function ProductPreviewSection({
  content,
  navLabels,
  stateLabels,
}: {
  content: LandingContent["preview"];
  navLabels: PreviewNavLabels;
  /** `dict.money.states` — одна подпись на каждое каноническое состояние. */
  stateLabels: Record<CanonicalFinancialState, string>;
}) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          {content.title}
        </h2>
        <p className="mt-3 text-pretty text-text-secondary">{content.subtitle}</p>
      </div>

      {/* App frame */}
      <div className="soft-card-lg mt-12 overflow-hidden" role="img" aria-label={content.subtitle}>
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-border-soft px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-danger/70" aria-hidden="true" />
          <span className="h-3 w-3 rounded-full bg-accent-yellow" aria-hidden="true" />
          <span className="h-3 w-3 rounded-full bg-accent-green" aria-hidden="true" />
        </div>

        <div className="flex">
          {/* Sidebar */}
          <aside className="hidden w-48 shrink-0 flex-col gap-1 border-r border-border-soft p-3 sm:flex">
            {NAV.map(({ key, icon: Icon, active }) => (
              <span
                key={key}
                className={cn(
                  "flex items-center gap-2.5 rounded-(--neu-radius-md) px-3 py-2 text-sm font-medium",
                  active
                    ? "bg-surface-sunken text-text-primary shadow-neu-inset"
                    : "text-text-secondary",
                )}
              >
                <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                {navLabels[key]}
              </span>
            ))}
          </aside>

          {/* Main panel */}
          <div className="flex-1 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-text-primary">{navLabels.money}</h3>
              <span className="inline-flex items-center gap-1.5 rounded-(--neu-radius-pill) bg-text-primary px-3 py-1.5 text-xs font-semibold text-text-inverse shadow-neu-control">
                <PlusIcon size={14} strokeWidth={2.2} aria-hidden="true" />
                {navLabels.money}
              </span>
            </div>

            <ul className="mt-5 flex flex-col gap-px overflow-hidden rounded-(--neu-radius-lg) border border-border-soft bg-border-soft">
              {content.rows.map((row) => {
                const state = row.state as CanonicalFinancialState;
                return (
                  <li
                    key={row.name}
                    className="flex items-center gap-3 bg-surface px-4 py-3.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                      {row.name}
                    </span>
                    <span className="shrink-0 text-sm font-medium text-text-secondary tabular-nums">
                      {row.amount}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        STATE_STYLE[state],
                      )}
                    >
                      {stateLabels[state]}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-text-tertiary">{content.caption}</p>
    </section>
  );
}
