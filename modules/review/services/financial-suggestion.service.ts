import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { createEntityLink } from "@/lib/entity-links";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { reserveOrganizationUsage, releaseOrganizationUsage } from "@/modules/billing";
import { createActionItemForDocument } from "@/modules/action-center/services/create-action-item-for-document";
import { classifyExpense, normalizeMerchantName, upsertPrivateMerchantRule } from "@/modules/moneyflow/services/expense-classifier";
import { findDuplicateTransaction } from "@/modules/documents/services/duplicate-detection";
import { createBillingPeriodKey } from "@/modules/subtracker/services/billing-period-key";
import { createSubscriptionPaymentCycle } from "@/modules/subtracker/services/create-subscription-payment-cycle";
import { markDocumentPlannerEntry } from "@/modules/planner/services/mark-document-planner-entry";
import { createSubscriptionPaymentTaskForCycle } from "@/modules/subtracker/services/create-subscription-payment-task";
import type { SubscriptionForPayment } from "@/modules/subtracker/types/payment-cycle.types";
import { assertReviewStateTransition, type ReviewState } from "../constants/review.constants";
import type {
  CreateDocumentSuggestionInput,
  CreateSubscriptionTaskSuggestionInput,
  FinancialSuggestion,
  SuggestionActionResult,
} from "../types/financial-suggestion.types";
import { FINANCIAL_SUGGESTION_COLUMNS } from "../types/financial-suggestion.types";

export async function createDocumentFinancialSuggestionRecord(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: CreateDocumentSuggestionInput,
): Promise<SuggestionActionResult<{ suggestion: FinancialSuggestion; created: boolean }>> {
  const document = await loadDocument(supabase, ctx.org.id, input.documentId);
  if (!document) return { ok: false, error: "Document not found" };

  await supabase.from("document_processing_results").upsert(
    {
      organization_id: ctx.org.id,
      workspace_id: ctx.workspace.id,
      document_id: input.documentId,
      extraction_id: input.extractionId,
      detected_vendor: input.vendorName,
      detected_amount: input.amount,
      detected_currency: input.currency,
      detected_issue_date: input.issueDate,
      detected_due_date: input.dueDate,
      detected_document_type: input.documentType,
      detected_payment_status: input.paymentStatus,
      detected_tax_amount: input.taxAmount,
      confidence_score: input.confidenceScore,
      raw_extraction_json: input.rawExtractionJson,
      created_by: ctx.user.id,
    },
    { onConflict: "document_id" },
  );

  const duplicate =
    input.amount && input.currency
      ? await findDuplicateTransaction(supabase, {
          organizationId: ctx.org.id,
          merchantName: input.vendorName,
          totalAmount: input.amount,
          currency: input.currency,
          transactionDate: input.issueDate ?? input.dueDate ?? new Date().toISOString().slice(0, 10),
          excludeDocumentId: input.documentId,
        })
      : { isDuplicate: false, matchedTransactionId: null };

  const metadata = {
    ...(input.metadata ?? {}),
    extraction_id: input.extractionId,
    source_document_id: input.documentId,
    duplicate_of: duplicate.matchedTransactionId,
    low_confidence: (input.confidenceScore ?? 1) < 0.75,
  };

  const existing = await findSuggestion(supabase, ctx.org.id, {
    sourceType: "document",
    sourceId: input.documentId,
    suggestionType: "create_expense",
  });

  if (existing) {
    if (existing.review_state === "confirmed" || existing.review_state === "rejected") {
      return { ok: true, data: { suggestion: existing, created: false } };
    }

    const updated = await updateSuggestionFields(supabase, ctx, existing, {
      amount: input.amount,
      currency: input.currency,
      vendor_name: input.vendorName,
      issue_date: input.issueDate,
      due_date: input.dueDate,
      document_type: input.documentType,
      tax_amount: input.taxAmount,
      payment_status: input.paymentStatus,
      confidence_score: input.confidenceScore,
      category_id: input.categoryId ?? null,
      expense_context_id: input.expenseContextId ?? null,
      metadata,
    });
    if (!updated.ok) return updated;

    const waiting = await ensureWaitingConfirmation(supabase, ctx, updated.data);
    if (!waiting.ok) return waiting;
    await ensureSuggestionActionItem(supabase, ctx, waiting.data);
    return { ok: true, data: { suggestion: waiting.data, created: false } };
  }

  const { data, error } = await supabase
    .from("financial_suggestions")
    .insert({
      organization_id: ctx.org.id,
      workspace_id: ctx.workspace.id,
      source_type: "document",
      source_id: input.documentId,
      suggestion_type: "create_expense",
      review_state: "waiting_confirmation",
      amount: input.amount,
      currency: input.currency,
      vendor_name: input.vendorName,
      issue_date: input.issueDate,
      due_date: input.dueDate,
      document_type: input.documentType,
      tax_amount: input.taxAmount,
      payment_status: input.paymentStatus,
      confidence_score: input.confidenceScore,
      category_id: input.categoryId ?? null,
      expense_context_id: input.expenseContextId ?? null,
      metadata,
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
    })
    .select(FINANCIAL_SUGGESTION_COLUMNS)
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      const raced = await findSuggestion(supabase, ctx.org.id, {
        sourceType: "document",
        sourceId: input.documentId,
        suggestionType: "create_expense",
      });
      if (raced) return { ok: true, data: { suggestion: raced, created: false } };
    }
    console.error("[createDocumentFinancialSuggestionRecord] insert failed:", error?.message);
    return { ok: false, error: "Failed to create financial suggestion" };
  }

  const suggestion = data as FinancialSuggestion;
  await ensureSuggestionActionItem(supabase, ctx, suggestion);

  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "document.detected_financial_data",
      aggregateType: "document",
      aggregateId: input.documentId,
      payload: suggestionAuditPayload(suggestion),
    }),
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "financial_suggestion.created",
      aggregateType: "financial_suggestion",
      aggregateId: suggestion.id,
      payload: suggestionAuditPayload(suggestion),
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "financial_suggestions",
      entityId: suggestion.id,
      action: "create",
      newData: suggestionAuditPayload(suggestion),
      metadata: { source: "system", trigger: "document_extraction" },
    }),
  ]);

  return { ok: true, data: { suggestion, created: true } };
}

export async function editFinancialSuggestionRecord(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: {
    suggestionId: string;
    vendorName?: string;
    amount?: number;
    currency?: string;
    issueDate?: string | null;
    dueDate?: string | null;
    taxAmount?: number | null;
    paymentStatus?: string | null;
    categoryId?: string | null;
    expenseContextId?: string | null;
  },
): Promise<SuggestionActionResult<{ suggestion: FinancialSuggestion }>> {
  const suggestion = await loadSuggestion(supabase, ctx.org.id, input.suggestionId);
  if (!suggestion) return { ok: false, error: "Suggestion not found" };
  if (suggestion.review_state === "confirmed" || suggestion.review_state === "rejected") {
    return { ok: false, error: "This suggestion has already been handled" };
  }

  const patch: Record<string, unknown> = {};
  if (input.vendorName !== undefined) patch.vendor_name = input.vendorName;
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.issueDate !== undefined) patch.issue_date = input.issueDate;
  if (input.dueDate !== undefined) patch.due_date = input.dueDate;
  if (input.taxAmount !== undefined) patch.tax_amount = input.taxAmount;
  if (input.paymentStatus !== undefined) patch.payment_status = input.paymentStatus;
  if (input.categoryId !== undefined) patch.category_id = input.categoryId;
  if (input.expenseContextId !== undefined) patch.expense_context_id = input.expenseContextId;

  const targetState = suggestion.review_state === "detected" ? "suggested" : suggestion.review_state;
  const updated = await updateSuggestionFields(supabase, ctx, suggestion, {
    ...patch,
    review_state: targetState,
  });
  if (!updated.ok) return updated;

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "financial_suggestion.edited",
    aggregateType: "financial_suggestion",
    aggregateId: suggestion.id,
    payload: {
      ...suggestionAuditPayload(updated.data),
      previous_state: suggestion.review_state,
      next_state: updated.data.review_state,
    },
  });

  return { ok: true, data: { suggestion: updated.data } };
}

export async function confirmFinancialSuggestionRecord(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: {
    suggestionId: string;
    accountId?: string;
    categoryId?: string | null;
    expenseContextId?: string | null;
    vendorName?: string;
    amount?: number;
    transactionDate?: string;
    currency?: string;
    rememberChoice?: boolean;
  },
): Promise<SuggestionActionResult<{ suggestion: FinancialSuggestion; transactionId: string; alreadyConfirmed: boolean }>> {
  let suggestion = await loadSuggestion(supabase, ctx.org.id, input.suggestionId);
  if (!suggestion) return { ok: false, error: "Suggestion not found" };
  if (suggestion.source_type !== "document" || suggestion.suggestion_type !== "create_expense") {
    return { ok: false, error: "This suggestion cannot create a transaction" };
  }
  if (suggestion.review_state === "confirmed" && suggestion.created_transaction_id) {
    return {
      ok: true,
      data: { suggestion, transactionId: suggestion.created_transaction_id, alreadyConfirmed: true },
    };
  }
  if (suggestion.review_state === "rejected") {
    return { ok: false, error: "Rejected suggestions cannot be confirmed" };
  }
  if (suggestion.review_state === "detected") {
    return { ok: false, error: "Suggestion must be reviewed before confirmation" };
  }
  if (suggestion.review_state === "suggested") {
    const waiting = await transitionSuggestionState(supabase, ctx, suggestion, "waiting_confirmation");
    if (!waiting.ok) return waiting;
    suggestion = waiting.data;
  }

  const amount = input.amount ?? suggestion.amount;
  const currency = input.currency ?? suggestion.currency;
  const vendorName = input.vendorName?.trim() || suggestion.vendor_name?.trim() || "Document expense";
  const transactionDate = input.transactionDate ?? suggestion.issue_date ?? suggestion.due_date ?? new Date().toISOString().slice(0, 10);
  if (!amount || amount <= 0 || !currency) {
    return { ok: false, error: "Review amount and currency before confirming" };
  }

  const document = await loadDocument(supabase, ctx.org.id, suggestion.source_id);
  if (!document) return { ok: false, error: "Source document not found" };

  const accountResult = await resolvePostingAccount(supabase, ctx.org.id, currency, input.accountId);
  if (!accountResult.ok) return accountResult;

  const categoryId = input.categoryId !== undefined ? input.categoryId : suggestion.category_id;
  const expenseContextId = input.expenseContextId !== undefined ? input.expenseContextId : suggestion.expense_context_id;
  const contextResult = await validateClassificationTargets(supabase, ctx, categoryId, expenseContextId);
  if (!contextResult.ok) return contextResult;

  let reserved = false;
  try {
    await reserveOrganizationUsage(ctx.org.id, "money_transactions.count", 1);
    reserved = true;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Money transaction limit reached" };
  }

  const visibility = contextResult.data.visibility;
  const ownerUserId = visibility === "private" ? ctx.user.id : null;
  const { data: transaction, error: insertError } = await supabase
    .from("money_transactions")
    .insert({
      organization_id: ctx.org.id,
      workspace_id: ctx.workspace.id,
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
      account_id: accountResult.data.accountId,
      category_id: categoryId,
      expense_context_id: expenseContextId,
      visibility,
      owner_user_id: ownerUserId,
      category_source: categoryId ? "manual" : null,
      categorization_status: categoryId ? "confirmed" : "uncategorized",
      type: "expense",
      status: "posted",
      amount,
      currency,
      transaction_date: transactionDate,
      title: vendorName,
      merchant_name: vendorName,
      confidence_score: suggestion.confidence_score,
      source_document_id: suggestion.source_id,
      source_extraction_id: typeof suggestion.metadata.extraction_id === "string" ? suggestion.metadata.extraction_id : null,
      note: typeof suggestion.metadata.duplicate_of === "string"
        ? "Possible duplicate was reviewed during document confirmation."
        : null,
    })
    .select("id")
    .single();

  if (insertError || !transaction) {
    if (reserved) await releaseOrganizationUsage(ctx.org.id, "money_transactions.count", 1);
    console.error("[confirmFinancialSuggestionRecord] transaction insert failed:", insertError?.message);
    return { ok: false, error: "The transaction could not be created" };
  }
  reserved = false;

  const transactionId = transaction.id as string;
  const confirmed = await updateSuggestionFields(supabase, ctx, suggestion, {
    review_state: "confirmed",
    amount,
    currency,
    vendor_name: vendorName,
    issue_date: transactionDate,
    category_id: categoryId,
    expense_context_id: expenseContextId,
    created_transaction_id: transactionId,
  });
  if (!confirmed.ok) return confirmed;

  if (categoryId && expenseContextId) {
    const normalizedMerchant = normalizeMerchantName(vendorName);
    await supabase.from("transaction_classifications").insert({
      organization_id: ctx.org.id,
      workspace_id: ctx.workspace.id,
      transaction_id: transactionId,
      owner_user_id: ownerUserId,
      visibility,
      category_id: categoryId,
      expense_context_id: expenseContextId,
      category_confidence: 1,
      context_confidence: 1,
      method: "manual",
      reason: "User confirmed the category and expense context during financial suggestion review.",
      matched_signals: ["financial_suggestion_review"],
      classifier_version: "financial-suggestion-v1",
      created_by: ctx.user.id,
    });
    if (input.rememberChoice) {
      await upsertPrivateMerchantRule(supabase, ctx, {
        normalizedMerchant,
        categoryId,
        expenseContextId,
      });
    }
  }

  await createEntityLink({
    sourceType: "document",
    sourceId: suggestion.source_id,
    targetType: "transaction",
    targetId: transactionId,
    linkType: "confirmed_as",
    relationDirection: "direct",
    metadata: {
      source: "user",
      status: "confirmed",
      confidence: suggestion.confidence_score ?? undefined,
      suggestion_id: suggestion.id,
    },
  });

  await resolveSuggestionActionItems(supabase, ctx, confirmed.data);
  // The Inbox capture this document came from is now fully decided — retire it so
  // it stops showing as "Processing" in the Inbox. No-op for documents uploaded
  // outside the Inbox (no sourced entry points at them).
  await markDocumentPlannerEntry(supabase, ctx, suggestion.source_id, "accepted");

  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "financial_suggestion.confirmed",
      aggregateType: "financial_suggestion",
      aggregateId: suggestion.id,
      payload: {
        ...suggestionAuditPayload(confirmed.data),
        previous_state: suggestion.review_state,
        next_state: "confirmed",
        created_transaction_id: transactionId,
      },
    }),
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "transaction.created_from_suggestion",
      aggregateType: "transaction",
      aggregateId: transactionId,
      payload: {
        ...suggestionAuditPayload(confirmed.data),
        created_transaction_id: transactionId,
      },
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "financial_suggestions",
      entityId: suggestion.id,
      action: "status_change",
      oldData: { review_state: suggestion.review_state },
      newData: { review_state: "confirmed", created_transaction_id: transactionId },
      metadata: suggestionAuditPayload(confirmed.data),
    }),
  ]);

  return {
    ok: true,
    data: { suggestion: confirmed.data, transactionId, alreadyConfirmed: false },
  };
}

export async function rejectFinancialSuggestionRecord(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: { suggestionId: string; reason?: string | null },
): Promise<SuggestionActionResult<{ suggestion: FinancialSuggestion }>> {
  const suggestion = await loadSuggestion(supabase, ctx.org.id, input.suggestionId);
  if (!suggestion) return { ok: false, error: "Suggestion not found" };
  if (suggestion.review_state === "confirmed") {
    return { ok: false, error: "Confirmed suggestions cannot be rejected" };
  }
  if (suggestion.review_state === "rejected") {
    return { ok: true, data: { suggestion } };
  }
  if (suggestion.review_state === "detected") {
    return { ok: false, error: "Suggestion must be surfaced before rejection" };
  }

  const rejected = await updateSuggestionFields(supabase, ctx, suggestion, {
    review_state: "rejected",
    rejected_reason: input.reason ?? null,
  });
  if (!rejected.ok) return rejected;

  await dismissSuggestionActionItems(supabase, ctx, rejected.data);
  if (suggestion.source_type === "document") {
    await markDocumentPlannerEntry(supabase, ctx, suggestion.source_id, "rejected");
  }

  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "financial_suggestion.rejected",
      aggregateType: "financial_suggestion",
      aggregateId: suggestion.id,
      payload: {
        ...suggestionAuditPayload(rejected.data),
        previous_state: suggestion.review_state,
        next_state: "rejected",
        rejected_reason: input.reason ?? null,
      },
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "financial_suggestions",
      entityId: suggestion.id,
      action: "status_change",
      oldData: { review_state: suggestion.review_state },
      newData: { review_state: "rejected", rejected_reason: input.reason ?? null },
      metadata: suggestionAuditPayload(rejected.data),
    }),
  ]);

  return { ok: true, data: { suggestion: rejected.data } };
}

export async function createSubscriptionTaskSuggestionRecord(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: CreateSubscriptionTaskSuggestionInput,
): Promise<SuggestionActionResult<{ suggestion: FinancialSuggestion; created: boolean }>> {
  const subscription = await loadSubscription(supabase, ctx.org.id, input.subscriptionId);
  if (!subscription) return { ok: false, error: "Subscription not found" };
  if (!subscription.is_active && input.taskType === "pay_subscription") {
    return { ok: false, error: "Cancelled subscriptions do not create payment suggestions" };
  }

  const dueDate = input.dueDate ?? (subscription.next_billing_date as string | null);
  const billingCycle = subscription.billing_cycle as "weekly" | "monthly" | "yearly";
  const billingPeriodKey = input.billingPeriodKey ?? (dueDate ? createBillingPeriodKey(dueDate, billingCycle) : "general");
  const idempotencyKey = `subscription:${input.subscriptionId}:task:${input.taskType}:period:${billingPeriodKey}`;

  const existing = await findSuggestion(supabase, ctx.org.id, {
    sourceType: "subscription",
    sourceId: input.subscriptionId,
    suggestionType: input.taskType,
    billingPeriodKey,
  });
  if (existing) return { ok: true, data: { suggestion: existing, created: false } };

  const { data, error } = await supabase
    .from("financial_suggestions")
    .insert({
      organization_id: ctx.org.id,
      workspace_id: (subscription.workspace_id as string | null) ?? ctx.workspace.id,
      source_type: "subscription",
      source_id: input.subscriptionId,
      suggestion_type: input.taskType,
      review_state: "waiting_confirmation",
      amount: input.amount ?? Number(subscription.amount),
      currency: input.currency ?? (subscription.currency as string | null),
      vendor_name: subscription.name as string,
      due_date: dueDate,
      confidence_score: input.confidenceScore ?? null,
      billing_period_key: billingPeriodKey,
      idempotency_key: idempotencyKey,
      metadata: {
        ...(input.metadata ?? {}),
        reason: input.reason ?? null,
        subscription_id: input.subscriptionId,
      },
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
    })
    .select(FINANCIAL_SUGGESTION_COLUMNS)
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      const raced = await findSuggestion(supabase, ctx.org.id, {
        sourceType: "subscription",
        sourceId: input.subscriptionId,
        suggestionType: input.taskType,
        billingPeriodKey,
      });
      if (raced) return { ok: true, data: { suggestion: raced, created: false } };
    }
    console.error("[createSubscriptionTaskSuggestionRecord] insert failed:", error?.message);
    return { ok: false, error: "Failed to create subscription task suggestion" };
  }

  const suggestion = data as FinancialSuggestion;
  await ensureSuggestionActionItem(supabase, ctx, suggestion);
  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: suggestion.workspace_id ?? ctx.workspace.id,
      eventName: "subscription_task_suggestion.created",
      aggregateType: "financial_suggestion",
      aggregateId: suggestion.id,
      payload: suggestionAuditPayload(suggestion),
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "financial_suggestions",
      entityId: suggestion.id,
      action: "create",
      newData: suggestionAuditPayload(suggestion),
      metadata: { source: "system", trigger: "subscription_workflow" },
    }),
  ]);

  return { ok: true, data: { suggestion, created: true } };
}

export async function confirmSubscriptionTaskSuggestionRecord(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: { suggestionId: string },
): Promise<SuggestionActionResult<{ suggestion: FinancialSuggestion; taskId: string; alreadyConfirmed: boolean }>> {
  let suggestion = await loadSuggestion(supabase, ctx.org.id, input.suggestionId);
  if (!suggestion) return { ok: false, error: "Suggestion not found" };
  if (suggestion.source_type !== "subscription") {
    return { ok: false, error: "This suggestion is not linked to a subscription" };
  }
  if (suggestion.review_state === "confirmed" && suggestion.created_task_id) {
    return { ok: true, data: { suggestion, taskId: suggestion.created_task_id, alreadyConfirmed: true } };
  }
  if (suggestion.review_state === "rejected") {
    return { ok: false, error: "Rejected suggestions cannot be confirmed" };
  }
  if (suggestion.review_state === "detected") {
    return { ok: false, error: "Suggestion must be reviewed before confirmation" };
  }
  if (suggestion.review_state === "suggested") {
    const waiting = await transitionSuggestionState(supabase, ctx, suggestion, "waiting_confirmation");
    if (!waiting.ok) return waiting;
    suggestion = waiting.data;
  }

  const subscription = await loadSubscription(supabase, ctx.org.id, suggestion.source_id);
  if (!subscription) return { ok: false, error: "Subscription not found" };
  if (!subscription.is_active && suggestion.suggestion_type === "pay_subscription") {
    return { ok: false, error: "Cancelled subscriptions do not create payment tasks" };
  }

  const taskResult =
    suggestion.suggestion_type === "pay_subscription"
      ? await confirmPaymentTaskSuggestion(supabase, ctx, suggestion, subscription)
      : await createGenericSubscriptionTask(supabase, ctx, suggestion, subscription);

  if (!taskResult.ok) return taskResult;

  const confirmed = await updateSuggestionFields(supabase, ctx, suggestion, {
    review_state: "confirmed",
    created_task_id: taskResult.data.taskId,
  });
  if (!confirmed.ok) return confirmed;

  await resolveSuggestionActionItems(supabase, ctx, confirmed.data);

  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: confirmed.data.workspace_id ?? ctx.workspace.id,
      eventName: "subscription_task_suggestion.confirmed",
      aggregateType: "financial_suggestion",
      aggregateId: suggestion.id,
      payload: {
        ...suggestionAuditPayload(confirmed.data),
        previous_state: suggestion.review_state,
        next_state: "confirmed",
        created_task_id: taskResult.data.taskId,
      },
    }),
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: confirmed.data.workspace_id ?? ctx.workspace.id,
      eventName: "task.created_from_subscription",
      aggregateType: "task",
      aggregateId: taskResult.data.taskId,
      payload: suggestionAuditPayload(confirmed.data),
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "financial_suggestions",
      entityId: suggestion.id,
      action: "status_change",
      oldData: { review_state: suggestion.review_state },
      newData: { review_state: "confirmed", created_task_id: taskResult.data.taskId },
      metadata: suggestionAuditPayload(confirmed.data),
    }),
  ]);

  return {
    ok: true,
    data: { suggestion: confirmed.data, taskId: taskResult.data.taskId, alreadyConfirmed: false },
  };
}

export async function getReviewItemsRecord(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: {
    state?: ReviewState;
    sourceType?: "document" | "subscription" | "relation";
    suggestionType?: string;
    limit: number;
  },
): Promise<SuggestionActionResult<{ suggestions: FinancialSuggestion[] }>> {
  let query = supabase
    .from("financial_suggestions")
    .select(FINANCIAL_SUGGESTION_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .order("created_at", { ascending: false })
    .limit(input.limit);

  if (input.state) query = query.eq("review_state", input.state);
  if (input.sourceType) query = query.eq("source_type", input.sourceType);
  if (input.suggestionType) query = query.eq("suggestion_type", input.suggestionType);

  const { data, error } = await query;
  if (error) {
    console.error("[getReviewItemsRecord] failed:", error.message);
    return { ok: false, error: "Failed to load review items" };
  }
  return { ok: true, data: { suggestions: (data as FinancialSuggestion[] | null) ?? [] } };
}

async function ensureWaitingConfirmation(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  suggestion: FinancialSuggestion,
): Promise<SuggestionActionResult<FinancialSuggestion>> {
  if (suggestion.review_state === "waiting_confirmation") return { ok: true, data: suggestion };
  if (suggestion.review_state === "detected") {
    const suggested = await transitionSuggestionState(supabase, ctx, suggestion, "suggested");
    if (!suggested.ok) return suggested;
    return transitionSuggestionState(supabase, ctx, suggested.data, "waiting_confirmation");
  }
  if (suggestion.review_state === "suggested") {
    return transitionSuggestionState(supabase, ctx, suggestion, "waiting_confirmation");
  }
  return { ok: false, error: "Suggestion is no longer awaiting confirmation" };
}

async function transitionSuggestionState(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  suggestion: FinancialSuggestion,
  nextState: ReviewState,
): Promise<SuggestionActionResult<FinancialSuggestion>> {
  if (suggestion.review_state === nextState) return { ok: true, data: suggestion };
  try {
    assertReviewStateTransition(suggestion.review_state, nextState);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid review transition" };
  }
  return updateSuggestionFields(supabase, ctx, suggestion, { review_state: nextState });
}

async function updateSuggestionFields(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  suggestion: FinancialSuggestion,
  patch: Record<string, unknown>,
): Promise<SuggestionActionResult<FinancialSuggestion>> {
  const nextState = patch.review_state as ReviewState | undefined;
  if (nextState && nextState !== suggestion.review_state) {
    try {
      assertReviewStateTransition(suggestion.review_state, nextState);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Invalid review transition" };
    }
  }

  const { data, error } = await supabase
    .from("financial_suggestions")
    .update({ ...patch, updated_by: ctx.user.id })
    .eq("id", suggestion.id)
    .eq("organization_id", ctx.org.id)
    .select(FINANCIAL_SUGGESTION_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    console.error("[updateSuggestionFields] failed:", error?.message);
    return { ok: false, error: "Failed to update suggestion" };
  }
  return { ok: true, data: data as FinancialSuggestion };
}

async function ensureSuggestionActionItem(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  suggestion: FinancialSuggestion,
): Promise<void> {
  const amountLabel =
    suggestion.amount && suggestion.currency
      ? formatAmount(suggestion.amount, suggestion.currency)
      : "amount needs review";
  const vendor = suggestion.vendor_name?.trim() || (suggestion.source_type === "subscription" ? "Subscription" : "Document");
  const actionType = actionTypeForSuggestion(suggestion);
  const title =
    suggestion.source_type === "document"
      ? `Invoice detected from ${vendor} - ${amountLabel}`
      : `${subscriptionTaskLabel(suggestion.suggestion_type)}: ${vendor}`;

  await createActionItemForDocument(supabase, ctx, {
    type: actionType,
    title,
    description:
      suggestion.source_type === "document"
        ? `Suggested action: Create expense. State: Waiting confirmation.`
        : `Suggested action: ${subscriptionTaskLabel(suggestion.suggestion_type)}. State: Waiting confirmation.`,
    sourceType: suggestion.source_type === "document" ? "document" : "subscription",
    sourceId: suggestion.source_id,
    primaryEntityType: suggestion.source_type,
    primaryEntityId: suggestion.source_id,
    financialImpact: suggestion.amount,
    aiConfidence: suggestion.confidence_score,
    aiReason: typeof suggestion.metadata.reason === "string" ? suggestion.metadata.reason : null,
    suggestionId: suggestion.id,
    reviewState: suggestion.review_state,
    sourceEntityType: suggestion.source_type,
    sourceEntityId: suggestion.source_id,
    metadata: {
      suggestion_id: suggestion.id,
      review_state: suggestion.review_state,
      suggested_action: suggestion.suggestion_type,
      vendor_name: suggestion.vendor_name,
      amount: suggestion.amount,
      currency: suggestion.currency,
      due_date: suggestion.due_date,
      linked_entities: [{ type: suggestion.source_type, id: suggestion.source_id }],
      ...suggestion.metadata,
    },
  });
}

async function resolveSuggestionActionItems(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  suggestion: FinancialSuggestion,
): Promise<void> {
  await supabase
    .from("action_items")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      review_state: "confirmed",
      metadata: { ...suggestion.metadata, suggestion_id: suggestion.id, review_state: "confirmed" },
    })
    .eq("organization_id", ctx.org.id)
    .eq("suggestion_id", suggestion.id)
    .in("status", ["open", "in_progress", "snoozed"]);
}

async function dismissSuggestionActionItems(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  suggestion: FinancialSuggestion,
): Promise<void> {
  await supabase
    .from("action_items")
    .update({
      status: "dismissed",
      dismissed_at: new Date().toISOString(),
      review_state: "rejected",
      metadata: { ...suggestion.metadata, suggestion_id: suggestion.id, review_state: "rejected" },
    })
    .eq("organization_id", ctx.org.id)
    .eq("suggestion_id", suggestion.id)
    .in("status", ["open", "in_progress", "snoozed"]);
}

async function resolvePostingAccount(
  supabase: SupabaseClient,
  organizationId: string,
  currency: string,
  accountId?: string,
): Promise<SuggestionActionResult<{ accountId: string }>> {
  let query = supabase
    .from("money_accounts")
    .select("id, currency")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .is("deleted_at", null);
  if (accountId) query = query.eq("id", accountId);
  else query = query.eq("currency", currency).order("created_at", { ascending: true }).limit(1);

  const { data, error } = await query.maybeSingle();
  if (error) return { ok: false, error: "The selected account is unavailable" };
  if (!data) {
    return {
      ok: false,
      error: `Pick or create an active ${currency} account before confirming.`,
      code: "currency_mismatch",
    };
  }
  if ((data.currency as string) !== currency) {
    return {
      ok: false,
      error: `This is a ${currency} document. Pick a ${currency} account to confirm it.`,
      code: "currency_mismatch",
    };
  }
  return { ok: true, data: { accountId: data.id as string } };
}

async function validateClassificationTargets(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  categoryId: string | null | undefined,
  expenseContextId: string | null | undefined,
): Promise<SuggestionActionResult<{ visibility: "organization" | "private" }>> {
  if (categoryId) {
    const { data: category } = await supabase
      .from("money_categories")
      .select("id")
      .eq("id", categoryId)
      .eq("organization_id", ctx.org.id)
      .eq("type", "expense")
      .eq("is_active", true)
      .maybeSingle();
    if (!category) return { ok: false, error: "The selected category is unavailable" };
  }

  if (!expenseContextId) return { ok: true, data: { visibility: "organization" } };
  const { data: context } = await supabase
    .from("expense_contexts")
    .select("id, visibility, owner_user_id")
    .eq("id", expenseContextId)
    .eq("organization_id", ctx.org.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!context) return { ok: false, error: "The selected expense context is unavailable" };
  if (context.visibility === "private" && context.owner_user_id !== ctx.user.id) {
    return { ok: false, error: "You cannot use another member's private expense context" };
  }
  return { ok: true, data: { visibility: (context.visibility as "organization" | "private") ?? "organization" } };
}

async function confirmPaymentTaskSuggestion(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  suggestion: FinancialSuggestion,
  subscription: Record<string, unknown>,
): Promise<SuggestionActionResult<{ taskId: string }>> {
  const dueDate = suggestion.due_date ?? (subscription.next_billing_date as string);
  const subscriptionForPayment: SubscriptionForPayment = {
    id: subscription.id as string,
    name: subscription.name as string,
    amount: Number(suggestion.amount ?? subscription.amount),
    currency: (suggestion.currency as string | null) ?? (subscription.currency as string),
    billing_cycle: subscription.billing_cycle as "weekly" | "monthly" | "yearly",
    billing_anchor_day: (subscription.billing_anchor_day as number | null) ?? null,
    next_billing_date: dueDate,
    default_category_id: (subscription.default_category_id as string | null) ?? null,
    auto_task_enabled: true,
    is_active: subscription.is_active as boolean,
    cancelled_at: (subscription.cancelled_at as string | null) ?? null,
    workspace_id: (subscription.workspace_id as string | null) ?? ctx.workspace.id,
  };

  const cycle = await createSubscriptionPaymentCycle({
    supabase,
    ctx,
    subscription: subscriptionForPayment,
    dueDate,
  });
  if (!cycle.ok) return cycle;

  const task = await createSubscriptionPaymentTaskForCycle({
    supabase,
    ctx,
    subscription: subscriptionForPayment,
    cycle: cycle.cycle,
  });
  if (!task.ok || !task.taskId) return { ok: false, error: task.ok ? "Task was not created" : task.error };
  return { ok: true, data: { taskId: task.taskId } };
}

async function createGenericSubscriptionTask(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  suggestion: FinancialSuggestion,
  subscription: Record<string, unknown>,
): Promise<SuggestionActionResult<{ taskId: string }>> {
  const taskId = randomUUID();
  const title = `${subscriptionTaskLabel(suggestion.suggestion_type)}: ${subscription.name as string}`.slice(0, 200);
  const { error } = await supabase.from("todos").insert({
    id: taskId,
    organization_id: ctx.org.id,
    workspace_id: (subscription.workspace_id as string | null) ?? ctx.workspace.id,
    created_by: ctx.user.id,
    updated_by: ctx.user.id,
    title,
    description: typeof suggestion.metadata.reason === "string" ? suggestion.metadata.reason : "",
    priority: suggestion.suggestion_type === "cancel_subscription" ? "high" : "medium",
    status: "todo",
    due_date: suggestion.due_date,
    recurrence: "none",
  });
  if (error) {
    console.error("[createGenericSubscriptionTask] insert failed:", error.message);
    return { ok: false, error: "Failed to create task" };
  }

  await createEntityLink({
    sourceType: "subscription",
    sourceId: suggestion.source_id,
    targetType: "task",
    targetId: taskId,
    linkType: "requires_action",
    relationDirection: "bidirectional",
    metadata: {
      source: "user",
      status: "confirmed",
      suggestion_id: suggestion.id,
      task_type: suggestion.suggestion_type,
    },
  });

  return { ok: true, data: { taskId } };
}

async function loadSuggestion(
  supabase: SupabaseClient,
  organizationId: string,
  suggestionId: string,
): Promise<FinancialSuggestion | null> {
  const { data } = await supabase
    .from("financial_suggestions")
    .select(FINANCIAL_SUGGESTION_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", suggestionId)
    .maybeSingle();
  return (data as FinancialSuggestion | null) ?? null;
}

async function findSuggestion(
  supabase: SupabaseClient,
  organizationId: string,
  input: {
    sourceType: string;
    sourceId: string;
    suggestionType: string;
    billingPeriodKey?: string | null;
  },
): Promise<FinancialSuggestion | null> {
  let query = supabase
    .from("financial_suggestions")
    .select(FINANCIAL_SUGGESTION_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("source_type", input.sourceType)
    .eq("source_id", input.sourceId)
    .eq("suggestion_type", input.suggestionType);
  if (input.billingPeriodKey !== undefined) query = query.eq("billing_period_key", input.billingPeriodKey);
  const { data } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as FinancialSuggestion | null) ?? null;
}

async function loadDocument(
  supabase: SupabaseClient,
  organizationId: string,
  documentId: string,
): Promise<{ id: string; title: string | null } | null> {
  const { data } = await supabase
    .from("documents")
    .select("id, title")
    .eq("id", documentId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as { id: string; title: string | null } | null) ?? null;
}

async function loadSubscription(
  supabase: SupabaseClient,
  organizationId: string,
  subscriptionId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from("subscriptions")
    .select("id, name, amount, currency, billing_cycle, billing_anchor_day, next_billing_date, default_category_id, auto_task_enabled, is_active, cancelled_at, workspace_id, created_by")
    .eq("id", subscriptionId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

function suggestionAuditPayload(suggestion: FinancialSuggestion): Record<string, unknown> {
  return {
    workspace_id: suggestion.workspace_id,
    actor_id: suggestion.updated_by ?? suggestion.created_by,
    source_entity_type: suggestion.source_type,
    source_entity_id: suggestion.source_id,
    target_entity_type: suggestion.created_transaction_id ? "transaction" : suggestion.created_task_id ? "task" : null,
    target_entity_id: suggestion.created_transaction_id ?? suggestion.created_task_id,
    suggestion_id: suggestion.id,
    relation_id: null,
    created_transaction_id: suggestion.created_transaction_id,
    created_task_id: suggestion.created_task_id,
    previous_state: null,
    next_state: suggestion.review_state,
    suggestion_type: suggestion.suggestion_type,
    amount: suggestion.amount,
    currency: suggestion.currency,
    confidence_score: suggestion.confidence_score,
  };
}

function actionTypeForSuggestion(suggestion: FinancialSuggestion) {
  if (suggestion.source_type === "document") return "draft_review" as const;
  if (suggestion.suggestion_type === "pay_subscription" || suggestion.suggestion_type === "request_invoice") {
    return "payment_required" as const;
  }
  if (suggestion.suggestion_type === "cancel_subscription") return "approval_required" as const;
  return "renewal_required" as const;
}

function subscriptionTaskLabel(type: string): string {
  switch (type) {
    case "review_subscription":
      return "Review subscription";
    case "pay_subscription":
      return "Pay subscription";
    case "request_invoice":
      return "Request invoice";
    case "cancel_subscription":
      return "Cancel subscription";
    case "update_payment_method":
      return "Update payment method";
    case "check_price_change":
      return "Check price change";
    default:
      return "Review";
  }
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export async function createDocumentSuggestionWithClassification(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: Omit<CreateDocumentSuggestionInput, "categoryId" | "expenseContextId"> & {
    itemNames?: string[];
    aiCategoryHints?: Array<string | null | undefined>;
  },
) {
  const classification = await classifyExpense(supabase, ctx, {
    merchantName: input.vendorName,
    itemNames: input.itemNames,
    aiCategoryHints: input.aiCategoryHints,
  });
  return createDocumentFinancialSuggestionRecord(supabase, ctx, {
    ...input,
    categoryId: classification.categoryId,
    expenseContextId: classification.expenseContextId,
    metadata: {
      ...(input.metadata ?? {}),
      classification_method: classification.method,
      classification_reason: classification.reason,
      category_confidence: classification.categoryConfidence,
      context_confidence: classification.contextConfidence,
      matched_signals: classification.matchedSignals,
    },
  });
}
