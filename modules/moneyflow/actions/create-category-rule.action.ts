"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo, isAdmin } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";
import {
  normalizeMerchantName,
  upsertPrivateMerchantRule,
} from "../services/expense-classifier";

/**
 * Create (or refresh) a merchant → category rule (Phase 5 §11, Phase 5.1 §4.3).
 *
 * Rules live in expense_classification_rules (057). Two scopes:
 *   • private (default) — affects only the caller's future categorization;
 *   • organization      — affects FUTURE transactions of every member, so it
 *     is admin/owner-gated (isAdmin + RLS is_org_admin from migration 070)
 *     and the UI shows an explicit confirmation before submitting.
 *
 * Historical transactions are never reclassified by creating a rule — the
 * pipeline runs only on transaction creation or on demand.
 */

const createRuleSchema = z.object({
  merchant: z.string().trim().min(2).max(240),
  categoryId: uuidSchema,
  expenseContextId: uuidSchema.nullish(),
  scope: z.enum(["private", "organization"]).default("private"),
  priority: z.number().int().min(0).max(1000).default(100),
});

export async function createCategoryRuleAction(
  input: z.input<typeof createRuleSchema>,
): Promise<{ error?: string }> {
  const parsed = createRuleSchema.safeParse(input);
  if (!parsed.success) return { error: "Enter a merchant and pick a category." };

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: "You do not have permission to create categorization rules." };
  }
  if (parsed.data.scope === "organization" && !isAdmin(ctx)) {
    return { error: "Only an owner or admin can create organization-wide rules." };
  }

  const normalizedMerchant = normalizeMerchantName(parsed.data.merchant);
  if (!normalizedMerchant) return { error: "The merchant name is not usable for a rule." };

  const supabase = await createClient();

  const { data: category } = await supabase
    .from("money_categories")
    .select("id")
    .eq("id", parsed.data.categoryId)
    .eq("organization_id", ctx.org.id)
    .eq("type", "expense")
    .eq("is_active", true)
    .maybeSingle();
  if (!category) return { error: "The selected category is unavailable." };

  let ruleId: string | null = null;
  if (parsed.data.scope === "private") {
    ruleId = await upsertPrivateMerchantRule(supabase, ctx, {
      normalizedMerchant,
      categoryId: parsed.data.categoryId,
      expenseContextId: parsed.data.expenseContextId ?? null,
    });
  } else {
    // Org-wide: one active rule per merchant (unique index). Refresh in place
    // when it already exists so re-submitting is idempotent.
    const { data: existing } = await supabase
      .from("expense_classification_rules")
      .select("id")
      .eq("organization_id", ctx.org.id)
      .eq("normalized_merchant", normalizedMerchant)
      .eq("visibility", "organization")
      .eq("is_active", true)
      .maybeSingle();

    const result = existing
      ? await supabase
          .from("expense_classification_rules")
          .update({
            category_id: parsed.data.categoryId,
            expense_context_id: parsed.data.expenseContextId ?? null,
            priority: parsed.data.priority,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .eq("organization_id", ctx.org.id)
          .select("id")
          .maybeSingle()
      : await supabase.from("expense_classification_rules").insert({
          organization_id: ctx.org.id,
          workspace_id: ctx.workspace.id,
          visibility: "organization",
          owner_user_id: null,
          normalized_merchant: normalizedMerchant,
          category_id: parsed.data.categoryId,
          expense_context_id: parsed.data.expenseContextId ?? null,
          source: "manual",
          priority: parsed.data.priority,
          created_by: ctx.user.id,
        })
          .select("id")
          .maybeSingle();

    if (result.error) {
      console.error("createCategoryRule org rule error:", result.error.message);
      return { error: "The rule could not be saved." };
    }
    ruleId = (result.data as { id?: string } | null)?.id ?? existing?.id ?? null;
  }

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "money.category_rule.created",
    aggregateType: "money_category_rule",
    aggregateId: ruleId ?? parsed.data.categoryId,
    payload: {
      rule_id: ruleId,
      merchant: normalizedMerchant,
      category_id: parsed.data.categoryId,
      scope: parsed.data.scope,
    },
  });

  revalidatePath(ROUTES.money);
  revalidatePath(`${ROUTES.money}/rules`);
  return {};
}
