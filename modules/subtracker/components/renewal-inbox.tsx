"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangleIcon, CalendarDaysIcon, CheckCircle2Icon, FileCheck2Icon, MailIcon, SearchIcon, ShieldCheckIcon, Trash2Icon, WalletCardsIcon } from "lucide-react";
import type { RenewalInboxItem, Subscription } from "@nevora/subscriptions-contracts";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { ROUTES } from "@/shared/config/routes";
import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/format-money";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { deleteSubscriptionAction } from "../actions/delete-subscription.action";
import { RenewalDecisionActions } from "./renewal-decision-actions";

type InboxFilter = "needs" | "upcoming" | "controlled" | "all";

interface RenewalInboxProps {
  items: RenewalInboxItem[];
  subscriptions: Subscription[];
  dict: Dictionary;
  canWrite: boolean;
  canDelete: boolean;
}

function interpolate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, String(value)), template);
}

function formatCurrencyGroups(values: Map<string, number>): string {
  if (values.size === 0) return "—";
  return Array.from(values.entries()).map(([currency, amount]) => `${currency} ${formatMoney(amount)}`).join(" · ");
}

function annualAmount(subscription: Subscription): number {
  if (subscription.billing_cycle === "weekly") return Number(subscription.amount) * 52;
  if (subscription.billing_cycle === "monthly") return Number(subscription.amount) * 12;
  return Number(subscription.amount);
}

export function RenewalInbox({ items, subscriptions, dict, canWrite, canDelete }: RenewalInboxProps) {
  const t = dict.subscriptions.renewal;
  const actionableCount = items.filter((item) => ["needs_decision", "reviewing", "overdue"].includes(item.attention_state)).length;
  const [filter, setFilter] = useState<InboxFilter>(actionableCount > 0 ? "needs" : "upcoming");
  const [search, setSearch] = useState("");

  const next30 = useMemo(() => {
    const grouped = new Map<string, number>();
    const today = new Date().toISOString().slice(0, 10);
    for (const subscription of subscriptions) {
      const days = Math.round((Date.parse(`${subscription.next_billing_date}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000);
      if (days < 0 || days > 30) continue;
      grouped.set(subscription.currency, (grouped.get(subscription.currency) ?? 0) + Number(subscription.amount));
    }
    return grouped;
  }, [subscriptions]);

  const annual = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const subscription of subscriptions) {
      grouped.set(subscription.currency, (grouped.get(subscription.currency) ?? 0) + annualAmount(subscription));
    }
    return grouped;
  }, [subscriptions]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (query && !item.subscription.name.toLocaleLowerCase().includes(query)) return false;
      if (filter === "needs") return ["needs_decision", "reviewing", "overdue"].includes(item.attention_state);
      if (filter === "upcoming") return item.days_until_renewal >= 0 && item.days_until_renewal <= 30;
      if (filter === "controlled") return ["future", "snoozed", "resolved_keep", "resolved_wont_renew"].includes(item.attention_state);
      return true;
    }).sort((a, b) => {
      const aOverdue = a.attention_state === "overdue" ? 0 : 1;
      const bOverdue = b.attention_state === "overdue" ? 0 : 1;
      return aOverdue - bOverdue || a.decision_due_date.localeCompare(b.decision_due_date) || a.subscription.name.localeCompare(b.subscription.name);
    });
  }, [filter, items, search]);

  const subscriptionsWithoutCases = useMemo(() => {
    const withCase = new Set(items.map((item) => item.subscription_id));
    const today = new Date().toISOString().slice(0, 10);
    return subscriptions.filter((subscription) => {
      if (withCase.has(subscription.id)) return false;
      if (search.trim() && !subscription.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) return false;
      if (filter !== "upcoming") return filter === "all";
      const days = Math.round((Date.parse(`${subscription.next_billing_date}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000);
      return days >= 0 && days <= 30;
    });
  }, [filter, items, search, subscriptions]);

  const allSubscriptions = useMemo(
    () => subscriptions.filter((subscription) => !search.trim() || subscription.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())),
    [search, subscriptions],
  );
  const hasRows = filter === "all" ? allSubscriptions.length > 0 : filtered.length + subscriptionsWithoutCases.length > 0;

  const filters: Array<{ id: InboxFilter; label: string }> = [
    { id: "needs", label: t.needsDecision },
    { id: "upcoming", label: t.upcomingPayments },
    { id: "controlled", label: t.underControl },
    { id: "all", label: t.all },
  ];

  return (
    <>
      <section className="mt-6 flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0">
        {[
          { label: t.needsDecision, value: String(actionableCount), icon: AlertTriangleIcon, accent: actionableCount > 0 ? "text-danger bg-danger-soft" : "text-accent-green bg-accent-green-soft" },
          { label: t.next30Days, value: formatCurrencyGroups(next30), icon: CalendarDaysIcon, accent: "text-accent-yellow bg-accent-yellow-soft" },
          { label: t.annualRunRate, value: formatCurrencyGroups(annual), icon: WalletCardsIcon, accent: "text-accent-lilac bg-accent-lilac-soft" },
        ].map(({ label, value, icon: Icon, accent }) => (
          <div key={label} className="soft-card-sm min-w-60 p-5 sm:min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</p><p className="mt-3 text-xl font-semibold tabular-nums text-text-primary sm:text-2xl">{value}</p></div>
              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-(--neu-radius-md)", accent)}><Icon size={18} /></div>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-7">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-(--neu-radius-pill) bg-surface-sunken p-1">
            {filters.map((tab) => (
              <button key={tab.id} type="button" onClick={() => setFilter(tab.id)} className={cn("shrink-0 rounded-(--neu-radius-pill) px-4 py-2 text-xs font-semibold transition-all", filter === tab.id ? "bg-surface text-text-primary shadow-neu-control" : "text-text-muted hover:text-text-primary")}>
                {tab.label}{tab.id === "needs" && actionableCount > 0 ? ` (${actionableCount})` : ""}
              </button>
            ))}
          </div>
          <label className="relative block w-full lg:w-72">
            <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={dict.common.noMatches} className="soft-control w-full py-2.5 pl-9 pr-4 text-sm" />
          </label>
        </div>

        {hasRows ? (
          <div className="mt-4 space-y-3">
            {filter === "all" ? allSubscriptions.map((subscription) => (
              <SubscriptionRegisterCard key={subscription.id} subscription={subscription} dict={dict} canDelete={canDelete} showDelete />
            )) : filtered.map((item) => <RenewalInboxCard key={item.id} item={item} dict={dict} canWrite={canWrite} />)}
            {filter === "upcoming" && subscriptionsWithoutCases.map((subscription) => <SubscriptionRegisterCard key={subscription.id} subscription={subscription} dict={dict} canDelete={canDelete} />)}
          </div>
        ) : (
          <div className="soft-inset mt-4 rounded-(--neu-radius-md) px-5 py-10 text-center">
            <CheckCircle2Icon size={28} className="mx-auto text-accent-green" />
            <h2 className="mt-3 text-base font-semibold text-text-primary">{filter === "upcoming" ? t.noUpcomingTitle : t.everythingControlled}</h2>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-text-muted">{filter === "upcoming" ? t.noUpcomingBody : t.noDecisionsBody}</p>
            {(search || filter !== "needs") && <Button type="button" variant="ghost" className="mt-4" onClick={() => { setSearch(""); setFilter("needs"); }}>{t.clearFilters}</Button>}
          </div>
        )}
      </section>
    </>
  );
}

function SubscriptionRegisterCard({
  subscription,
  dict,
  canDelete,
  showDelete = false,
}: {
  subscription: Subscription;
  dict: Dictionary;
  canDelete: boolean;
  showDelete?: boolean;
}) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const deleteLabel = dict.subscriptions.form.deleteButton;

  function closeConfirmation() {
    if (isDeleting) return;
    setError(null);
    setIsConfirming(false);
  }

  function handleDelete() {
    setError(null);
    startDelete(async () => {
      const result = await deleteSubscriptionAction(subscription.id);
      if (result.error) {
        setError(result.error);
        return;
      }

      setIsConfirming(false);
      router.refresh();
    });
  }

  return (
    <>
      <article className={cn("soft-card-sm flex items-center gap-3 p-4 transition-all hover:shadow-neu-card", isDeleting && "pointer-events-none opacity-50")}>
        <Link href={`${ROUTES.subscriptions}/${subscription.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-(--neu-radius-md) bg-accent-lilac-soft font-semibold text-accent-lilac">{subscription.name.charAt(0).toUpperCase()}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-text-primary">{subscription.name}</p><p className="mt-1 text-xs text-text-muted">{dict.subscriptions.cycles[subscription.billing_cycle]} · {subscription.next_billing_date}</p></div>
          <p className="shrink-0 text-sm font-semibold tabular-nums text-text-primary">{subscription.currency} {formatMoney(Number(subscription.amount))}</p>
        </Link>

        {showDelete && canDelete && (
          <button
            type="button"
            onClick={() => setIsConfirming(true)}
            disabled={isDeleting}
            className="soft-icon-button h-9 w-9 shrink-0 text-text-muted transition-colors hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`${deleteLabel}: ${subscription.name}`}
            title={deleteLabel}
          >
            <Trash2Icon size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </article>

      <Modal
        isOpen={isConfirming}
        onClose={closeConfirmation}
        title={`${deleteLabel} “${subscription.name}”?`}
        closeLabel={dict.common.close}
      >
        {error && <p className="text-sm text-danger" role="alert" aria-live="polite">{error}</p>}

        <div className={cn("flex justify-end gap-2", error && "mt-5")}>
          <button
            type="button"
            onClick={closeConfirmation}
            disabled={isDeleting}
            className="rounded-lg px-3 py-2 text-sm font-medium text-text-secondary disabled:opacity-60"
          >
            {dict.inbox.cancel}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {isDeleting ? dict.common.loading : deleteLabel}
          </button>
        </div>
      </Modal>
    </>
  );
}

function RenewalInboxCard({ item, dict, canWrite }: { item: RenewalInboxItem; dict: Dictionary; canWrite: boolean }) {
  const t = dict.subscriptions.renewal;
  const urgency = item.attention_state === "overdue"
    ? interpolate(t.overdue, { days: Math.abs(item.days_until_decision) })
    : item.attention_state === "needs_decision"
      ? t.decideToday
      : item.attention_state === "reviewing"
        ? t.reviewing
        : item.attention_state === "snoozed" && item.snoozed_until
          ? interpolate(t.snoozedUntil, { date: item.snoozed_until.slice(0, 10) })
          : item.attention_state === "resolved_keep"
            ? t.kept
            : item.attention_state === "resolved_wont_renew"
              ? t.wontRenewState
              : interpolate(t.daysLeft, { days: Math.max(0, item.days_until_decision) });
  const urgent = item.attention_state === "overdue" || item.attention_state === "needs_decision";

  return (
    <article className={cn("soft-card-sm p-4 sm:p-5", urgent && "border border-danger/15")}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-(--neu-radius-md)", urgent ? "bg-danger-soft text-danger" : "bg-accent-lilac-soft text-accent-lilac")}>
            {urgent ? <AlertTriangleIcon size={18} /> : <ShieldCheckIcon size={18} />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`${ROUTES.subscriptions}/${item.subscription.id}`} className="truncate text-sm font-semibold text-text-primary hover:underline">{item.subscription.name}</Link>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", urgent ? "bg-danger-soft text-danger" : "bg-surface-sunken text-text-secondary")}>{urgency}</span>
            </div>
            <p className="mt-1 text-sm font-semibold tabular-nums text-text-primary">{item.subscription.currency} {formatMoney(item.subscription.amount)} · {dict.subscriptions.cycles[item.subscription.billing_cycle]}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
              <span>{interpolate(t.renewsOn, { date: item.renewal_date })}</span>
              <span>{interpolate(t.decideBy, { date: item.decision_due_date })}</span>
              <span className="inline-flex items-center gap-1">{item.has_invoice ? <FileCheck2Icon size={13} className="text-accent-green" /> : <MailIcon size={13} />}{item.has_invoice ? t.invoiceAttached : t.noInvoice}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          {!item.has_invoice && <Link href={`${ROUTES.subscriptions}/${item.subscription.id}#gmail-invoices`} className="inline-flex items-center gap-1.5 rounded-(--neu-radius-pill) px-3 py-2 text-xs font-semibold text-text-muted hover:bg-surface-sunken hover:text-text-primary"><MailIcon size={14} /> {t.findInvoice}</Link>}
          <RenewalDecisionActions item={item} dict={dict} canWrite={canWrite} compact />
        </div>
      </div>
    </article>
  );
}
