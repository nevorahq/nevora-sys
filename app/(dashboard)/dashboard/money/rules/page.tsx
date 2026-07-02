import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { requireOrg } from "@/lib/auth/require-org";
import { isAdmin } from "@/lib/context/current-context";
import { getCategories } from "@/modules/moneyflow/queries/get-categories";
import { getCategoryRules } from "@/modules/moneyflow/queries/get-category-rules";
import { CategoryRulesManager } from "@/modules/moneyflow/components/category-rules-manager";
import { ROUTES } from "@/shared/config/routes";

/**
 * Categorization rules management (Phase 5.1 §4.2).
 * Rules are exact normalized-merchant matches (057). Private rules are the
 * default; organization-wide creation is offered only to owner/admin.
 */
export default async function MoneyRulesPage() {
  const { dict } = await getDictionary();
  const ctx = await requireOrg();

  const [rules, categories] = await Promise.all([
    getCategoryRules(ctx.org.id),
    // Rules target the expense taxonomy (057 semantics).
    getCategories(ctx.org.id, "expense"),
  ]);

  return (
    <>
      <div className="mb-6">
        <Link
          href={ROUTES.money}
          className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary"
        >
          <ArrowLeftIcon size={16} /> {dict.money.title}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-text-primary">{dict.money.rules.title}</h1>
        <p className="mt-1 text-sm text-text-muted">{dict.money.rules.description}</p>
      </div>

      <CategoryRulesManager
        rules={rules}
        categories={categories.map((category) => ({ id: category.id, name: category.name }))}
        labels={dict.money.rules}
        canManageOrgRules={isAdmin(ctx)}
        currentUserId={ctx.user.id}
      />
    </>
  );
}
