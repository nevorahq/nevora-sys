"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";
import {
  normalizeMerchantName,
  upsertPrivateMerchantRule,
} from "../services/expense-classifier";

/**
 * Explicitly create (or refresh) a private merchant → category rule
 * (Phase 5, spec §11: createMoneyCategoryRule).
 *
 * Rules live in expense_classification_rules (migration 057) and are private
 * to the caller: one member's rule never silently reclassifies transactions
 * for the whole organization. The rule wins over history/system/AI on the
 * next categorization run.
 */

const createRuleSchema = z.object({
  merchant: z.string().trim().min(2).max(240),
  categoryId: uuidSchema,
  expenseContextId: uuidSchema.nullish(),
});

export async function createCategoryRuleAction(
  input: z.infer<typeof createRuleSchema>,
): Promise<{ error?: string }> {
  const parsed = createRuleSchema.safeParse(input);
  if (!parsed.success) return { error: "Enter a merchant and pick a category." };

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: "You do not have permission to create categorization rules." };
  }

  const normalizedMerchant = normalizeMerchantName(parsed.data.merchant);
  if (!normalizedMerchant) return { error: "The merchant name is not usable for a rule." };

  const supabase = await createClient();

  const { data: category } = await supabase
    .from("money_categories")
    .select("id")
    .eq("id", parsed.data.categoryId)
    .eq("organization_id", ctx.org.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!category) return { error: "The selected category is unavailable." };

  await upsertPrivateMerchantRule(supabase, ctx, {
    normalizedMerchant,
    categoryId: parsed.data.categoryId,
    expenseContextId: parsed.data.expenseContextId ?? null,
  });

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "money.category_rule.created",
    aggregateType: "money_category_rule",
    aggregateId: parsed.data.categoryId,
    payload: { merchant: normalizedMerchant, category_id: parsed.data.categoryId },
  });

  revalidatePath(ROUTES.money);
  return {};
}
