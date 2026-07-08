"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult, isAccessError } from "@/lib/security";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import {
  confirmFinancialSuggestionSchema,
  confirmSubscriptionTaskSuggestionSchema,
  createDocumentFinancialSuggestionSchema,
  createSubscriptionTaskSuggestionSchema,
  editFinancialSuggestionSchema,
  getReviewItemsSchema,
  rejectFinancialSuggestionSchema,
} from "../schemas/financial-suggestion.schema";
import {
  confirmFinancialSuggestionRecord,
  confirmSubscriptionTaskSuggestionRecord,
  createDocumentFinancialSuggestionRecord,
  createSubscriptionTaskSuggestionRecord,
  editFinancialSuggestionRecord,
  getReviewItemsRecord,
  rejectFinancialSuggestionRecord,
} from "../services/financial-suggestion.service";
import type { SuggestionActionResult } from "../types/financial-suggestion.types";

export async function createDocumentFinancialSuggestion(
  input: unknown,
): Promise<SuggestionActionResult<{ suggestionId: string; created: boolean }>> {
  const parsed = createDocumentFinancialSuggestionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await guardedWriteContext();
  if (!ctx.ok) return ctx;

  const supabase = await createClient();
  const result = await createDocumentFinancialSuggestionRecord(supabase, ctx.data, {
    documentId: parsed.data.documentId,
    extractionId: parsed.data.extractionId ?? null,
    vendorName: parsed.data.vendorName ?? null,
    amount: parsed.data.amount ?? null,
    currency: parsed.data.currency ?? null,
    issueDate: parsed.data.issueDate ?? null,
    dueDate: parsed.data.dueDate ?? null,
    documentType: parsed.data.documentType ?? null,
    taxAmount: parsed.data.taxAmount ?? null,
    paymentStatus: parsed.data.paymentStatus ?? null,
    confidenceScore: parsed.data.confidenceScore ?? null,
    rawExtractionJson: parsed.data.rawExtractionJson,
    categoryId: parsed.data.categoryId ?? null,
    expenseContextId: parsed.data.expenseContextId ?? null,
    metadata: parsed.data.metadata,
  });

  if (!result.ok) return result;
  revalidatePath(`${ROUTES.documents}/${parsed.data.documentId}`);
  revalidatePath(ROUTES.actions);
  return {
    ok: true,
    data: { suggestionId: result.data.suggestion.id, created: result.data.created },
  };
}

export async function editFinancialSuggestion(
  input: unknown,
): Promise<SuggestionActionResult<{ suggestionId: string }>> {
  const parsed = editFinancialSuggestionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await guardedWriteContext();
  if (!ctx.ok) return ctx;

  const supabase = await createClient();
  const result = await editFinancialSuggestionRecord(supabase, ctx.data, parsed.data);
  if (!result.ok) return result;
  revalidatePath(ROUTES.actions);
  if (result.data.suggestion.source_type === "document") {
    revalidatePath(`${ROUTES.documents}/${result.data.suggestion.source_id}`);
  }
  return { ok: true, data: { suggestionId: result.data.suggestion.id } };
}

export async function confirmFinancialSuggestion(
  input: unknown,
): Promise<SuggestionActionResult<{ suggestionId: string; transactionId: string; alreadyConfirmed: boolean }>> {
  const parsed = confirmFinancialSuggestionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await guardedWriteContext();
  if (!ctx.ok) return ctx;

  const supabase = await createClient();
  const result = await confirmFinancialSuggestionRecord(supabase, ctx.data, parsed.data);
  if (!result.ok) return result;
  revalidatePath(ROUTES.actions);
  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  revalidatePath(`${ROUTES.documents}/${result.data.suggestion.source_id}`);
  return {
    ok: true,
    data: {
      suggestionId: result.data.suggestion.id,
      transactionId: result.data.transactionId,
      alreadyConfirmed: result.data.alreadyConfirmed,
    },
  };
}

export async function rejectFinancialSuggestion(
  input: unknown,
): Promise<SuggestionActionResult<{ suggestionId: string }>> {
  const parsed = rejectFinancialSuggestionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await guardedWriteContext();
  if (!ctx.ok) return ctx;

  const supabase = await createClient();
  const result = await rejectFinancialSuggestionRecord(supabase, ctx.data, {
    suggestionId: parsed.data.suggestionId,
    reason: parsed.data.reason ?? null,
  });
  if (!result.ok) return result;
  revalidatePath(ROUTES.actions);
  if (result.data.suggestion.source_type === "document") {
    revalidatePath(`${ROUTES.documents}/${result.data.suggestion.source_id}`);
  }
  if (result.data.suggestion.source_type === "subscription") {
    revalidatePath(`${ROUTES.subscriptions}/${result.data.suggestion.source_id}`);
  }
  return { ok: true, data: { suggestionId: result.data.suggestion.id } };
}

export async function createSubscriptionTaskSuggestion(
  input: unknown,
): Promise<SuggestionActionResult<{ suggestionId: string; created: boolean }>> {
  const parsed = createSubscriptionTaskSuggestionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await guardedWriteContext();
  if (!ctx.ok) return ctx;

  const supabase = await createClient();
  const result = await createSubscriptionTaskSuggestionRecord(supabase, ctx.data, {
    subscriptionId: parsed.data.subscriptionId,
    taskType: parsed.data.taskType,
    billingPeriodKey: parsed.data.billingPeriodKey ?? null,
    dueDate: parsed.data.dueDate ?? null,
    amount: parsed.data.amount ?? null,
    currency: parsed.data.currency ?? null,
    reason: parsed.data.reason ?? null,
    confidenceScore: parsed.data.confidenceScore ?? null,
    metadata: parsed.data.metadata,
  });
  if (!result.ok) return result;
  revalidatePath(ROUTES.actions);
  revalidatePath(`${ROUTES.subscriptions}/${parsed.data.subscriptionId}`);
  return {
    ok: true,
    data: { suggestionId: result.data.suggestion.id, created: result.data.created },
  };
}

export async function confirmSubscriptionTaskSuggestion(
  input: unknown,
): Promise<SuggestionActionResult<{ suggestionId: string; taskId: string; alreadyConfirmed: boolean }>> {
  const parsed = confirmSubscriptionTaskSuggestionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await guardedWriteContext();
  if (!ctx.ok) return ctx;

  const supabase = await createClient();
  const result = await confirmSubscriptionTaskSuggestionRecord(supabase, ctx.data, parsed.data);
  if (!result.ok) return result;
  revalidatePath(ROUTES.actions);
  revalidatePath(ROUTES.tasks);
  revalidatePath(ROUTES.subscriptions);
  revalidatePath(`${ROUTES.subscriptions}/${result.data.suggestion.source_id}`);
  return {
    ok: true,
    data: {
      suggestionId: result.data.suggestion.id,
      taskId: result.data.taskId,
      alreadyConfirmed: result.data.alreadyConfirmed,
    },
  };
}

export async function getReviewItems(input: unknown = {}) {
  const parsed = getReviewItemsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "action_center.view", intent: "read" });
  } catch (err) {
    if (isAccessError(err)) return { ok: false, error: err.message };
    throw err;
  }
  if (!canDo(ctx, "action_center.view")) return { ok: false, error: "Forbidden" };

  const supabase = await createClient();
  return getReviewItemsRecord(supabase, ctx, parsed.data);
}

async function guardedWriteContext(): Promise<
  | { ok: true; data: Awaited<ReturnType<typeof requireAppAccess>> }
  | { ok: false; error: string }
> {
  try {
    const ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
    if (!canDo(ctx, "data.write")) return { ok: false, error: "Forbidden" };
    return { ok: true, data: ctx };
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return { ok: false, error: denied.error ?? "Access denied" };
    throw err;
  }
}
