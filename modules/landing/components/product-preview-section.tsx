"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRightIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  FolderKanbanIcon,
  LandmarkIcon,
  ListTodoIcon,
  Repeat2Icon,
  WalletCardsIcon,
  type LucideIcon,
} from "lucide-react";
import { type CanonicalFinancialState } from "@/modules/moneyflow/contracts";
import {
  authUrl,
  PRODUCT_ENTRY_ROUTE_BY_ID,
  PRODUCT_IDS,
  ROUTES,
  type ProductId,
} from "@/shared/config/routes";
import type { PublicLocale } from "@/shared/i18n/constants";
import { cn } from "@/shared/utils/cn";
import { STATE_STYLE } from "@nevora/financial-state/ui";
import type { LandingContent } from "../constants/landing-content";

interface ProductCopy {
  title: string;
  description: string;
  metric: string;
  metricLabel: string;
  openLabel: string;
  items: Array<{ title: string; meta: string; status: string }>;
}

const PRODUCT_COPY: Record<PublicLocale, Record<ProductId, ProductCopy>> = {
  en: {
    tasks: {
      title: "Tasks",
      description: "Plan day-to-day work without finance or subscription screens getting in the way.",
      metric: "12",
      metricLabel: "open tasks",
      openLabel: "Open Tasks",
      items: [
        { title: "Prepare client proposal", meta: "Today · High priority", status: "In progress" },
        { title: "Update release checklist", meta: "Product launch", status: "To do" },
        { title: "Review landing copy", meta: "Marketing", status: "Done" },
      ],
    },
    finance: {
      title: "Finance",
      description: "Track accounts and transactions, then automate categorisation with explicit rules.",
      metric: "€4,280",
      metricLabel: "tracked balance",
      openLabel: "Open Finance",
      items: [],
    },
    subscriptions: {
      title: "Subscriptions",
      description: "See recurring services, renewal dates and payment status in one focused workspace.",
      metric: "3",
      metricLabel: "renewals this month",
      openLabel: "Open Subscriptions",
      items: [
        { title: "Cloud storage", meta: "Renews 24 Aug · €15", status: "Active" },
        { title: "Design tools", meta: "Renews 2 Sep · €24", status: "Upcoming" },
        { title: "Team calls", meta: "Renews 11 Sep · €12", status: "Active" },
      ],
    },
  },
  ru: {
    tasks: {
      title: "Задачи",
      description: "Планируйте ежедневную работу без экранов финансов и подписок, которые отвлекают от цели.",
      metric: "12",
      metricLabel: "открытых задач",
      openLabel: "Открыть Задачи",
      items: [
        { title: "Подготовить предложение клиенту", meta: "Сегодня · Высокий приоритет", status: "В работе" },
        { title: "Обновить чек-лист релиза", meta: "Запуск продукта", status: "К выполнению" },
        { title: "Проверить текст лендинга", meta: "Маркетинг", status: "Готово" },
      ],
    },
    finance: {
      title: "Финансы",
      description: "Контролируйте счета и транзакции, затем автоматизируйте категоризацию явными правилами.",
      metric: "€4 280",
      metricLabel: "учтённый баланс",
      openLabel: "Открыть Финансы",
      items: [],
    },
    subscriptions: {
      title: "Подписки",
      description: "Следите за регулярными сервисами, датами продления и статусами оплаты в отдельном пространстве.",
      metric: "3",
      metricLabel: "продления в этом месяце",
      openLabel: "Открыть Подписки",
      items: [
        { title: "Облачное хранилище", meta: "Продление 24 авг. · €15", status: "Активна" },
        { title: "Инструменты дизайна", meta: "Продление 2 сент. · €24", status: "Скоро" },
        { title: "Командные звонки", meta: "Продление 11 сент. · €12", status: "Активна" },
      ],
    },
  },
  ro: {
    tasks: {
      title: "Sarcini",
      description: "Planifică munca zilnică fără ecrane de finanțe sau abonamente care distrag atenția.",
      metric: "12",
      metricLabel: "sarcini deschise",
      openLabel: "Deschide Sarcini",
      items: [
        { title: "Pregătește oferta pentru client", meta: "Astăzi · Prioritate înaltă", status: "În lucru" },
        { title: "Actualizează lista de lansare", meta: "Lansare produs", status: "De făcut" },
        { title: "Verifică textul landingului", meta: "Marketing", status: "Gata" },
      ],
    },
    finance: {
      title: "Finanțe",
      description: "Urmărește conturile și tranzacțiile, apoi automatizează clasificarea prin reguli explicite.",
      metric: "€4.280",
      metricLabel: "sold urmărit",
      openLabel: "Deschide Finanțe",
      items: [],
    },
    subscriptions: {
      title: "Abonamente",
      description: "Vezi serviciile recurente, datele de reînnoire și starea plăților într-un spațiu dedicat.",
      metric: "3",
      metricLabel: "reînnoiri luna aceasta",
      openLabel: "Deschide Abonamente",
      items: [
        { title: "Stocare cloud", meta: "Reînnoire 24 aug. · €15", status: "Activ" },
        { title: "Instrumente de design", meta: "Reînnoire 2 sept. · €24", status: "În curând" },
        { title: "Apeluri de echipă", meta: "Reînnoire 11 sept. · €12", status: "Activ" },
      ],
    },
  },
};

const PRODUCT_ICONS: Record<ProductId, LucideIcon> = {
  tasks: ListTodoIcon,
  finance: WalletCardsIcon,
  subscriptions: Repeat2Icon,
};

const PANEL_ICONS: Record<ProductId, LucideIcon> = {
  tasks: FolderKanbanIcon,
  finance: LandmarkIcon,
  subscriptions: CalendarClockIcon,
};

export function ProductPreviewSection({
  content,
  locale,
  stateLabels,
}: {
  content: LandingContent["preview"];
  locale: PublicLocale;
  stateLabels: Record<CanonicalFinancialState, string>;
}) {
  const [activeProduct, setActiveProduct] = useState<ProductId>("tasks");
  const product = PRODUCT_COPY[locale][activeProduct];
  const PanelIcon = PANEL_ICONS[activeProduct];

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
          className="grid grid-cols-3 gap-1 rounded-(--neu-radius-lg) bg-surface-sunken p-1 shadow-neu-inset"
          role="tablist"
          aria-label={content.title}
        >
          {PRODUCT_IDS.map((productId) => {
            const Icon = PRODUCT_ICONS[productId];
            const isActive = activeProduct === productId;
            return (
              <button
                key={productId}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={PRODUCT_COPY[locale][productId].title}
                aria-controls="landing-product-panel"
                id={`landing-product-${productId}`}
                onClick={() => setActiveProduct(productId)}
                className={cn(
                  "soft-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-(--neu-radius-md) px-2 text-sm font-semibold transition-[background-color,box-shadow,color,transform] duration-300 sm:px-4",
                  isActive
                    ? "bg-surface text-text-primary shadow-neu-control"
                    : "text-text-tertiary hover:bg-surface/60 hover:text-text-primary",
                )}
              >
                <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
                <span className="hidden sm:inline">{PRODUCT_COPY[locale][productId].title}</span>
              </button>
            );
          })}
        </div>

        <div
          key={activeProduct}
          id="landing-product-panel"
          role="tabpanel"
          aria-labelledby={`landing-product-${activeProduct}`}
          className="nv-preview-swap grid gap-7 p-4 sm:p-7 md:grid-cols-[0.82fr_1.18fr] md:items-stretch"
        >
          <div className="flex flex-col justify-between rounded-(--neu-radius-lg) bg-surface-sunken p-5 shadow-neu-inset sm:p-6">
            <div>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-(--neu-radius-md) bg-surface text-text-primary shadow-neu-control">
                <PanelIcon size={21} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-2xl font-semibold tracking-tight text-text-primary">{product.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">{product.description}</p>
            </div>

            <div className="mt-8">
              <p className="text-3xl font-semibold tabular-nums text-text-primary">{product.metric}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-text-tertiary">{product.metricLabel}</p>
              <Link
                href={authUrl(ROUTES.login, PRODUCT_ENTRY_ROUTE_BY_ID[activeProduct])}
                className="soft-focus mt-5 inline-flex min-h-11 items-center gap-2 rounded-(--neu-radius-pill) bg-text-primary px-5 text-sm font-semibold text-text-inverse shadow-neu-control transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-neu-card active:translate-y-0 active:shadow-neu-inset"
              >
                {product.openLabel}
                <ArrowUpRightIcon size={16} strokeWidth={2} aria-hidden="true" />
              </Link>
            </div>
          </div>

          <ul className="flex min-h-72 flex-col gap-px overflow-hidden rounded-(--neu-radius-lg) border border-border-soft bg-border-soft">
            {activeProduct === "finance"
              ? content.rows.slice(0, 3).map((row) => {
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
              : product.items.map((item) => (
                  <li key={item.title} className="flex flex-1 items-center gap-3 bg-surface px-4 py-4 sm:px-5">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-(--neu-radius-md) bg-surface-sunken text-accent-green shadow-neu-inset">
                      <CheckCircle2Icon size={17} strokeWidth={1.9} aria-hidden="true" />
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
