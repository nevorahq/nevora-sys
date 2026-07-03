"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo, isAdmin } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";

/**
 * Update / enable / disable / delete a categorization rule (Phase 5.1 §4.2).
 *
 * Scope rules mirror creation: a private rule is manageable only by its owner;
 * an organization rule only by owner/admin. RLS (migration 070) enforces the
 * same at the database layer — the action checks are for clean error messages,
 * not the security boundary.
 */

const updateRuleSchema = z.object({
  ruleId: uuidSchema,
  categoryId: uuidSchema.optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});

const deleteRuleSchema = z.object({ ruleId: uuidSchema });

type RuleRow = {
  id: string;
  visibility: "private" | "organization";
  owner_user_id: string | null;
  category_id: string | null;
  is_active: boolean;
};

export async function updateCategoryRuleAction(
  input: z.input<typeof updateRuleSchema>,
): Promise<{ error?: string }> {
  const parsed = updateRuleSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid rule input." };
  const { ruleId, categoryId, priority, isActive } = parsed.data;
  if (categoryId === undefined && priority === undefined && isActive === undefined) {
    return { error: "Nothing to update." };
  }

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: "You do not have permission to manage categorization rules." };
  }

  const supabase = await createClient();
  const rule = await loadRule(supabase, ctx.org.id, ruleId);
  if ("error" in rule) return rule;
  const denied = checkScopeAccess(ctx, rule);
  if (denied) return denied;

  if (categoryId) {
    const { data: category } = await supabase
      .from("money_categories")
      .select("id")
      .eq("id", categoryId)
      .eq("organization_id", ctx.org.id)
      .eq("type", "expense")
      .eq("is_active", true)
      .maybeSingle();
    if (!category) return { error: "The selected category is unavailable." };
  }

  const { error: updateError } = await supabase
    .from("expense_classification_rules")
    .update({
      ...(categoryId !== undefined ? { category_id: categoryId } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(isActive !== undefined ? { is_active: isActive } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", ruleId)
    .eq("organization_id", ctx.org.id);

  if (updateError) {
    console.error("updateCategoryRule error:", updateError.message);
    return { error: "The rule could not be updated." };
  }

  const toggled = isActive !== undefined && isActive !== rule.is_active;
  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: toggled
      ? isActive
        ? "money.category_rule.enabled"
        : "money.category_rule.disabled"
      : "money.category_rule.updated",
    aggregateType: "money_category_rule",
    aggregateId: ruleId,
    payload: toggled
      ? { rule_id: ruleId, scope: rule.visibility }
      : { rule_id: ruleId, scope: rule.visibility, category_id: categoryId ?? rule.category_id },
  });

  revalidatePath(`${ROUTES.money}/rules`);
  return {};
}

export async function deleteCategoryRuleAction(
  input: z.input<typeof deleteRuleSchema>,
): Promise<{ error?: string }> {
  const parsed = deleteRuleSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid rule." };

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.delete")) {
    return { error: "You do not have permission to delete categorization rules." };
  }

  const supabase = await createClient();
  const rule = await loadRule(supabase, ctx.org.id, parsed.data.ruleId);
  if ("error" in rule) return rule;
  const denied = checkScopeAccess(ctx, rule);
  if (denied) return denied;

  const { error: deleteError } = await supabase
    .from("expense_classification_rules")
    .delete()
    .eq("id", rule.id)
    .eq("organization_id", ctx.org.id);

  if (deleteError) {
    console.error("deleteCategoryRule error:", deleteError.message);
    return { error: "The rule could not be deleted." };
  }

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "money.category_rule.deleted",
    aggregateType: "money_category_rule",
    aggregateId: rule.id,
    payload: { rule_id: rule.id, scope: rule.visibility },
  });

  revalidatePath(`${ROUTES.money}/rules`);
  return {};
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type Ctx = Awaited<ReturnType<typeof requireOrg>>;

async function loadRule(
  supabase: SupabaseServerClient,
  organizationId: string,
  ruleId: string,
): Promise<RuleRow | { error: string }> {
  const { data, error } = await supabase
    .from("expense_classification_rules")
    .select("id, visibility, owner_user_id, category_id, is_active")
    .eq("id", ruleId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("loadRule error:", error.message);
    return { error: "The rule could not be loaded." };
  }
  if (!data) return { error: "Rule not found." };
  return data as RuleRow;
}

function checkScopeAccess(ctx: Ctx, rule: RuleRow): { error: string } | null {
  if (rule.visibility === "private" && rule.owner_user_id !== ctx.user.id) {
    return { error: "You can only manage your own private rules." };
  }
  if (rule.visibility === "organization" && !isAdmin(ctx)) {
    return { error: "Only an owner or admin can manage organization-wide rules." };
  }
  return null;
}
