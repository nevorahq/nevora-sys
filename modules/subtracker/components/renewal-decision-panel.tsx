import { AlertTriangleIcon, CalendarClockIcon, CheckCircle2Icon, CircleHelpIcon } from "lucide-react";
import type { RenewalInboxItem } from "@nevora/subscriptions-contracts";
import { cn } from "@/shared/utils/cn";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { RenewalDecisionActions } from "./renewal-decision-actions";

export function RenewalDecisionPanel({ item, dict, canWrite }: { item: RenewalInboxItem; dict: Dictionary; canWrite: boolean }) {
  const t = dict.subscriptions.renewal;
  const stateLabel = item.status === "keep" ? t.kept : item.status === "wont_renew" ? t.wontRenewState : item.status === "reviewing" ? t.reviewing : t.notDecided;
  const Icon = item.attention_state === "overdue" ? AlertTriangleIcon : item.status === "keep" || item.status === "wont_renew" ? CheckCircle2Icon : item.status === "reviewing" ? CalendarClockIcon : CircleHelpIcon;
  const urgent = item.attention_state === "overdue" || item.attention_state === "needs_decision";

  return (
    <section className={cn("soft-card p-5 sm:p-6", urgent && "border border-danger/15")}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-(--neu-radius-md)", urgent ? "bg-danger-soft text-danger" : "bg-accent-lilac-soft text-accent-lilac")}><Icon size={19} /></div>
          <div><h2 className="text-base font-semibold text-text-primary">{t.renewalDecision}</h2><p className="mt-1 text-sm text-text-muted">{t.decideBy.replace("{date}", item.decision_due_date)} · {t.renewsOn.replace("{date}", item.renewal_date)}</p></div>
        </div>
        <span className="rounded-full bg-surface-sunken px-3 py-1 text-xs font-semibold text-text-secondary">{stateLabel}</span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-(--neu-radius-md) bg-surface-sunken px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{t.renewalDecision}</p><p className="mt-1 text-sm font-medium text-text-primary">{stateLabel}</p></div>
        <div className="rounded-(--neu-radius-md) bg-surface-sunken px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{t.paymentStatus}</p><p className="mt-1 text-sm font-medium text-text-primary">—</p></div>
        <div className="rounded-(--neu-radius-md) bg-surface-sunken px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{t.providerStatus}</p><p className="mt-1 text-sm font-medium text-text-primary">{t.vendorActive}</p></div>
      </div>
      <div className="mt-5"><RenewalDecisionActions item={item} dict={dict} canWrite={canWrite} /></div>
    </section>
  );
}
