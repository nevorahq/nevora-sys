"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { checkPlanLimit } from "@/lib/billing";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";
import {
  categorizeTransaction,
  type CategorizeOutcome,
} from "../services/money-categorization.service";

const categorizeSchema = z.object({ transactionId: uuidSchema });
const bulkSchema = z.object({ transactionIds: z.array(uuidSchema).min(1).max(20) });

export interface CategorizeActionResult {
  error?: string;
  outcome?: CategorizeOutcome["outcome"];
}

/**
 * Run the rule-first categorization pipeline for one posted transaction.
 * Rules apply directly; history/system/AI produce a reviewable suggestion.
 */
export async function categorizeTransactionAction(
  input: z.infer<typeof categorizeSchema>,
): Promise<CategorizeActionResult> {
  const parsed = categorizeSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid transaction." };

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: "You do not have permission to categorize transactions." };
  }

  // Soft pre-check for a friendlier error; the ai_requests trigger stays the
  // atomic guard inside the service.
  const limitCheck = await checkPlanLimit(ctx.org.id, "ai_calls");

  const supabase = await createClient();
  const result = await categorizeTransaction(supabase, ctx, parsed.data.transactionId, {
    allowAi: limitCheck.allowed,
  });

  if (result.outcome === "not_found") return { error: "Transaction not found or not editable." };

  revalidatePath(ROUTES.money);
  revalidatePath(`${ROUTES.money}/${parsed.data.transactionId}`);
  return { outcome: result.outcome };
}

export interface BulkCategorizeResult {
  error?: string;
  ruleApplied: number;
  suggested: number;
  uncategorized: number;
  failed: number;
}

/**
 * Categorize up to 20 transactions in one pass. AI stops for the rest of the
 * batch once the quota is exhausted; rule/history/system steps keep running.
 */
export async function bulkCategorizeTransactionsAction(
  input: z.infer<typeof bulkSchema>,
): Promise<BulkCategorizeResult> {
  const empty = { ruleApplied: 0, suggested: 0, uncategorized: 0, failed: 0 };
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { ...empty, error: "Invalid selection." };

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { ...empty, error: "You do not have permission to categorize transactions." };
  }

  const supabase = await createClient();
  let allowAi = (await checkPlanLimit(ctx.org.id, "ai_calls")).allowed;
  const counts = { ...empty };

  for (const transactionId of parsed.data.transactionIds) {
    const result = await categorizeTransaction(supabase, ctx, transactionId, { allowAi });
    switch (result.outcome) {
      case "rule_applied":
        counts.ruleApplied += 1;
        break;
      case "suggested":
        counts.suggested += 1;
        break;
      case "ai_quota_exceeded":
        allowAi = false;
        counts.uncategorized += 1;
        break;
      case "ai_failed":
        counts.failed += 1;
        break;
      case "uncategorized":
        counts.uncategorized += 1;
        break;
      default:
        break;
    }
  }

  revalidatePath(ROUTES.money);
  return counts;
}
