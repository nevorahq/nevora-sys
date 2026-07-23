import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CalendarIcon, ExternalLinkIcon, RepeatIcon } from "lucide-react";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { createClient } from "@/lib/supabase/server";
import { UniversalRelationViewer } from "@/modules/relations";
import { getPaymentCyclesForSubscription } from "@/modules/subtracker/queries/get-payment-cycles";
import { SubscriptionPaymentWorkflowPanel } from "@/modules/subtracker/components/subscription-payment-workflow-panel";
import { SubscriptionSuggestionPanel } from "@/modules/subtracker/components/subscription-suggestion-panel";
import { getAccounts } from "@/modules/moneyflow/queries/get-accounts";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";

export default async function SubscriptionDetailPage({ params }: PageProps<"/dashboard/subscriptions/[subscriptionId]">) {
  const { subscriptionId } = await params;
  const ctx = await requireOrg();
  const { org } = ctx;
  const { dict } = await getDictionary();

  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, name, amount, currency, billing_cycle, next_billing_date, last_payment_date, category, is_active, cancelled_at, url, note")
    .eq("id", subscriptionId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (!sub) notFound();

  const [cycles, accounts, suggestionsRes] = await Promise.all([
    getPaymentCyclesForSubscription(org.id, sub.id),
    getAccounts(org.id),
    supabase
      .from("financial_suggestions")
      .select("id, suggestion_type, review_state, amount, currency, due_date")
      .eq("organization_id", org.id)
      .eq("source_type", "subscription")
      .eq("source_id", sub.id)
      .in("review_state", ["suggested", "waiting_confirmation"])
      .order("created_at", { ascending: false }),
  ]);
  const currentCycle = cycles.find((c) => c.status === "planned" || c.status === "task_open") ?? null;
  const history = cycles.filter((c) => c.id !== currentCycle?.id);
  const canWrite = canDo(ctx, "data.write");

  return (
    <>
      <div className="mb-6">
        <Link href={ROUTES.subscriptions} className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary"><ArrowLeftIcon size={16} /> {dict.subscriptions.title}</Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">{sub.name}</h1>
            <p className="mt-1 text-sm text-text-muted">{sub.currency} {sub.amount} · {sub.billing_cycle}</p>
          </div>
          <span className="rounded-full bg-surface-sunken px-3 py-1 text-xs font-medium text-text-secondary">{sub.is_active ? "Active" : "Inactive"}</span>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="space-y-6">
          <SubscriptionSuggestionPanel
            suggestions={(suggestionsRes.data ?? []).map((s) => ({
              id: s.id as string,
              suggestion_type: s.suggestion_type as string,
              review_state: s.review_state as "detected" | "suggested" | "waiting_confirmation" | "confirmed" | "rejected",
              amount: s.amount == null ? null : Number(s.amount),
              currency: (s.currency as string | null) ?? null,
              due_date: (s.due_date as string | null) ?? null,
            }))}
            canWrite={canWrite}
            stateLabels={dict.money.states}
          />
          <SubscriptionPaymentWorkflowPanel
            subscriptionId={sub.id}
            isActive={sub.is_active}
            lastPaymentDate={sub.last_payment_date}
            nextPaymentDate={sub.next_billing_date}
            currentCycle={currentCycle}
            history={history}
            accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
            canWrite={canWrite}
            stateLabels={dict.money.states}
            inlineAccount={dict.money.inlineAccount}
            accountTypeLabels={dict.money.accounts.types}
          />
          {sub.note && <section className="soft-card p-5 sm:p-6"><h2 className="text-base font-semibold text-text-primary">Notes</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-primary">{sub.note}</p></section>}
          <UniversalRelationViewer entityType="subscription" entityId={sub.id} allowCreate={canDo(ctx, "entity_link.create")} allowDelete={canDo(ctx, "entity_link.delete")} revalidate={`${ROUTES.subscriptions}/${sub.id}`} />
        </main>
        <aside className="space-y-4">
          <section className="soft-card-sm space-y-4 p-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted"><CalendarIcon size={13} /> Next billing</p>
              <p className="mt-2 text-sm text-text-primary">{sub.next_billing_date}</p>
            </div>
            <div>
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted"><RepeatIcon size={13} /> Cycle</p>
              <p className="mt-2 text-sm capitalize text-text-primary">{sub.billing_cycle}</p>
            </div>
            {sub.url && <a href={sub.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary underline hover:text-text-primary"><ExternalLinkIcon size={14} /> Open website</a>}
          </section>
        </aside>
      </div>
    </>
  );
}
