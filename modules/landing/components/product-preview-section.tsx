"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRightIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  FolderKanbanIcon,
  InboxIcon,
  LandmarkIcon,
  ListTodoIcon,
  Repeat2Icon,
  SparklesIcon,
  WalletCardsIcon,
  type LucideIcon,
} from "lucide-react";
import { type CanonicalFinancialState } from "@/modules/moneyflow/contracts";
import { authUrl, ROUTES, type ProductEntryRoute } from "@/shared/config/routes";
import { cn } from "@/shared/utils/cn";
import { STATE_STYLE } from "@nevora/financial-state/ui";
import type { LandingContent, PreviewId } from "../constants/landing-content";

/** Куда ведёт «Открыть …» после входа — только разрешённые `next`-маршруты. */
const PREVIEW_ENTRY_ROUTE: Record<PreviewId, ProductEntryRoute> = {
  inbox: ROUTES.inbox,
  tasks: ROUTES.tasks,
  finance: ROUTES.money,
  subscriptions: ROUTES.subscriptions,
};

const TAB_ICONS: Record<PreviewId, LucideIcon> = {
  inbox: InboxIcon,
  tasks: ListTodoIcon,
  finance: WalletCardsIcon,
  subscriptions: Repeat2Icon,
};

const PANEL_ICONS: Record<PreviewId, LucideIcon> = {
  inbox: SparklesIcon,
  tasks: FolderKanbanIcon,
  finance: LandmarkIcon,
  subscriptions: CalendarClockIcon,
};

/**
 * Интерактивное превью одного рабочего пространства: вкладки повторяют разделы
 * боковой панели приложения. Вкладка «Финансы» показывает строки с каноническими
 * бейджами состояний (`content.rows`), остальные — примерные элементы вкладки.
 */
export function ProductPreviewSection({
  content,
  stateLabels,
}: {
  content: LandingContent["preview"];
  stateLabels: Record<CanonicalFinancialState, string>;
}) {
  const [activeId, setActiveId] = useState<PreviewId>("inbox");
  const tab = content.tabs.find((candidate) => candidate.id === activeId) ?? content.tabs[0];
  const tabId = tab.id as PreviewId;
  const PanelIcon = PANEL_ICONS[tabId];

  return (
    <section id="products" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          {content.title}
        </h2>
        <p className="mt-3 text-pretty text-text-secondary">{content.subtitle}</p>
      </div>

      <div className="soft-card-lg mt-10 overflow-hidden p-2 sm:mt-12 sm:p-3">
        <div
          className="grid grid-cols-4 gap-1 rounded-(--neu-radius-lg) bg-surface-sunken p-1 shadow-neu-inset"
          role="tablist"
          aria-label={content.title}
        >
          {content.tabs.map((candidate) => {
            const id = candidate.id as PreviewId;
            const Icon = TAB_ICONS[id];
            const isActive = tabId === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={candidate.title}
                aria-controls="landing-product-panel"
                id={`landing-product-${id}`}
                onClick={() => setActiveId(id)}
                className={cn(
                  "soft-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-(--neu-radius-md) px-2 text-sm font-semibold transition-[background-color,box-shadow,color,transform] duration-300 sm:px-4",
                  isActive
                    ? "bg-surface text-text-primary shadow-neu-control"
                    : "text-text-tertiary hover:bg-surface/60 hover:text-text-primary",
                )}
              >
                <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
                <span className="hidden truncate sm:inline">{candidate.title}</span>
              </button>
            );
          })}
        </div>

        <div
          key={tabId}
          id="landing-product-panel"
          role="tabpanel"
          aria-labelledby={`landing-product-${tabId}`}
          className="nv-preview-swap grid gap-7 p-4 sm:p-7 md:grid-cols-[0.82fr_1.18fr] md:items-stretch"
        >
          <div className="flex flex-col justify-between rounded-(--neu-radius-lg) bg-surface-sunken p-5 shadow-neu-inset sm:p-6">
            <div>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-(--neu-radius-md) bg-surface text-text-primary shadow-neu-control">
                <PanelIcon size={21} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-2xl font-semibold tracking-tight text-text-primary">{tab.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">{tab.description}</p>
            </div>

            <div className="mt-8">
              <p className="text-3xl font-semibold tabular-nums text-text-primary">{tab.metric}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-text-tertiary">{tab.metricLabel}</p>
              <Link
                href={authUrl(ROUTES.login, PREVIEW_ENTRY_ROUTE[tabId])}
                className="soft-focus mt-5 inline-flex min-h-11 items-center gap-2 rounded-(--neu-radius-pill) bg-text-primary px-5 text-sm font-semibold text-text-inverse shadow-neu-control transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-neu-card active:translate-y-0 active:shadow-neu-inset"
              >
                {tab.openLabel}
                <ArrowUpRightIcon size={16} strokeWidth={2} aria-hidden="true" />
              </Link>
            </div>
          </div>

          <ul className="flex min-h-72 flex-col gap-px overflow-hidden rounded-(--neu-radius-lg) border border-border-soft bg-border-soft">
            {tabId === "finance"
              ? content.rows.map((row) => {
                  const state = row.state as CanonicalFinancialState;
                  return (
                    <li key={row.name} className="flex flex-1 items-center gap-3 bg-surface px-4 py-4 sm:px-5">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-(--neu-radius-md) bg-surface-sunken text-text-secondary shadow-neu-inset">
                        <WalletCardsIcon size={17} strokeWidth={1.8} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text-primary">{row.name}</span>
                        <span className="mt-1 block text-xs text-text-tertiary">{row.amount}</span>
                      </span>
                      <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", STATE_STYLE[state])}>
                        {stateLabels[state]}
                      </span>
                    </li>
                  );
                })
              : tab.items.map((item) => (
                  <li key={item.title} className="flex flex-1 items-center gap-3 bg-surface px-4 py-4 sm:px-5">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-(--neu-radius-md) bg-surface-sunken text-accent-green shadow-neu-inset">
                      {/* Во Входящих — черновики на проверку, а не завершённые дела. */}
                      {tabId === "inbox" ? (
                        <SparklesIcon size={17} strokeWidth={1.9} aria-hidden="true" />
                      ) : (
                        <CheckCircle2Icon size={17} strokeWidth={1.9} aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-text-primary">{item.title}</span>
                      <span className="mt-1 block truncate text-xs text-text-tertiary">{item.meta}</span>
                    </span>
                    <span className="hidden shrink-0 rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-medium text-text-secondary sm:inline">{item.status}</span>
                  </li>
                ))}
          </ul>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-text-tertiary">{content.caption}</p>
    </section>
  );
}
