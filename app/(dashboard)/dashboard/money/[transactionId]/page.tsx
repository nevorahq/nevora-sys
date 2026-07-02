import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ArrowRightLeftIcon, CalendarIcon, TagIcon, WalletIcon } from "lucide-react";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { createClient } from "@/lib/supabase/server";
import { UniversalRelationViewer } from "@/modules/relations";
import { AiSuggestionPanel } from "@/modules/moneyflow/components/ai-suggestion-panel";
import { ROUTES } from "@/shared/config/routes";

export default async function TransactionDetailPage({ params }: PageProps<"/dashboard/money/[transactionId]">) {
  const { transactionId } = await params;
  const ctx = await requireOrg();
  const { org } = ctx;

  const supabase = await createClient();
  const { data: tx } = await supabase
    .from("money_transactions")
    .select("id, title, amount, currency, transaction_date, type, note, status, category_id, categorization_status, account:money_accounts!account_id(name), category:money_categories(name), from_account:money_accounts!from_account_id(name), to_account:money_accounts!to_account_id(name)")
    .eq("id", transactionId)
    .eq("organization_id", org.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!tx) notFound();

  const account = Array.isArray(tx.account) ? tx.account[0] : tx.account;
  const category = Array.isArray(tx.category) ? tx.category[0] : tx.category;
  const fromAccount = Array.isArray(tx.from_account) ? tx.from_account[0] : tx.from_account;
  const toAccount = Array.isArray(tx.to_account) ? tx.to_account[0] : tx.to_account;
  const isTransfer = tx.type === "transfer";
  const isIncome = tx.type === "income";

  // Money Intelligence: pending suggestion + selectable categories for the
  // AI Categorization block. Transfers carry no category (067) and drafts are
  // reviewed in the Planned flow, so both skip the panel.
  const showAiPanel = !isTransfer && tx.status === "posted" && canDo(ctx, "data.write");
  type PendingSuggestion = {
    id: string;
    suggested_category_id: string | null;
    suggested_category_name: string | null;
    confidence: number;
    reasoning: string | null;
    source: "history" | "system" | "ai";
  };
  let pendingSuggestion: PendingSuggestion | null = null;
  let typeCategories: Array<{ id: string; name: string }> = [];
  if (showAiPanel) {
    const [suggestionResult, categoriesResult] = await Promise.all([
      supabase
        .from("money_ai_suggestions")
        .select("id, suggested_category_id, suggested_category_name, confidence, reasoning, source")
        .eq("organization_id", org.id)
        .eq("transaction_id", tx.id)
        .eq("status", "pending")
        .maybeSingle(),
      supabase
        .from("money_categories")
        .select("id, name")
        .eq("organization_id", org.id)
        .eq("type", tx.type)
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);
    pendingSuggestion = (suggestionResult.data as PendingSuggestion | null) ?? null;
    typeCategories = (categoriesResult.data as Array<{ id: string; name: string }> | null) ?? [];
  }

  return (
    <>
      <div className="mb-6">
        <Link href={ROUTES.money} className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary"><ArrowLeftIcon size={16} /> Money</Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">{tx.title}</h1>
            <p className="mt-1 text-sm text-text-muted">
              {isTransfer
                ? `${tx.transaction_date}${fromAccount && toAccount ? ` · ${fromAccount.name} → ${toAccount.name}` : ""}`
                : `${tx.transaction_date}${account ? ` · ${account.name}` : ""}`}
            </p>
          </div>
          {isTransfer ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-3 py-1 text-sm font-semibold text-text-secondary">
              <ArrowRightLeftIcon size={13} /> {tx.currency} {tx.amount}
            </span>
          ) : (
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${isIncome ? "bg-accent-green-soft text-accent-green" : "bg-accent-pink-soft text-accent-pink"}`}>
              {isIncome ? "+" : "−"}{tx.currency} {tx.amount}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="space-y-6">
          {showAiPanel && (
            <AiSuggestionPanel
              transactionId={tx.id}
              categorizationStatus={(tx.categorization_status as string) ?? "uncategorized"}
              hasCategory={Boolean(tx.category_id)}
              suggestion={pendingSuggestion}
              categories={typeCategories}
            />
          )}
          {tx.note && <section className="soft-card p-5 sm:p-6"><h2 className="text-base font-semibold text-text-primary">Notes</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-primary">{tx.note}</p></section>}
          <UniversalRelationViewer entityType="transaction" entityId={tx.id} allowCreate={canDo(ctx, "entity_link.create")} allowDelete={canDo(ctx, "entity_link.delete")} revalidate={`${ROUTES.money}/${tx.id}`} />
        </main>
        <aside className="space-y-4">
          <section className="soft-card-sm space-y-4 p-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted"><CalendarIcon size={13} /> Date</p>
              <p className="mt-2 text-sm text-text-primary">{tx.transaction_date}</p>
            </div>
            {isTransfer ? (
              (fromAccount || toAccount) && <div>
                <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted"><ArrowRightLeftIcon size={13} /> Transfer</p>
                <p className="mt-2 text-sm text-text-primary">{fromAccount?.name ?? "—"} → {toAccount?.name ?? "—"}</p>
              </div>
            ) : (
              account && <div>
                <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted"><WalletIcon size={13} /> Account</p>
                <p className="mt-2 text-sm text-text-primary">{account.name}</p>
              </div>
            )}
            {category && <div>
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted"><TagIcon size={13} /> Category</p>
              <p className="mt-2 text-sm text-text-primary">{category.name}</p>
            </div>}
          </section>
        </aside>
      </div>
    </>
  );
}
