import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CalendarIcon, ExternalLinkIcon, RepeatIcon } from "lucide-react";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { createClient } from "@/lib/supabase/server";
import { UniversalRelationViewer } from "@/modules/relations";
import { ROUTES } from "@/shared/config/routes";

export default async function SubscriptionDetailPage({ params }: PageProps<"/dashboard/subscriptions/[subscriptionId]">) {
  const { subscriptionId } = await params;
  const ctx = await requireOrg();
  const { org } = ctx;

  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, name, amount, currency, billing_cycle, next_billing_date, category, is_active, url, note")
    .eq("id", subscriptionId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (!sub) notFound();

  return (
    <>
      <div className="mb-6">
        <Link href={ROUTES.subscriptions} className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary"><ArrowLeftIcon size={16} /> Subscriptions</Link>
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
