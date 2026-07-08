import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canDo, type CurrentContext } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import { createEntityLink } from "@/lib/entity-links";
import { createStandardTask } from "@/modules/tasks/services/create-standard-task";
import { createFinancialTask } from "@/modules/tasks/services/create-financial-task";
import { createActionItemForDocument } from "@/modules/action-center/services/create-action-item-for-document";
import { DEFAULT_REMINDER_OFFSET_DAYS, type TaskContextType } from "@/modules/tasks/constants/task.constants";
import {
  createTaskPayloadSchema,
  financialTaskPayloadSchema,
  linkEntitiesPayloadSchema,
  createActionItemPayloadSchema,
  type SuggestionLinkTarget,
} from "../schemas/planner-suggestion.schema";
import {
  PLANNER_SUGGESTION_COLUMNS,
  PLANNER_SUGGESTION_OPEN_STATUSES,
  type PlannerSuggestion,
  type PlannerSuggestionStatus,
  type PlannerSuggestionType,
} from "../types/planner.types";
import { resolvePlannerActionItems } from "./resolve-planner-action-item";

type OpenStatus = (typeof PLANNER_SUGGESTION_OPEN_STATUSES)[number];

function isOpenStatus(status: PlannerSuggestionStatus): status is OpenStatus {
  return (PLANNER_SUGGESTION_OPEN_STATUSES as readonly PlannerSuggestionStatus[]).includes(status);
}

/**
 * Release a claim after a failed creation so the user can retry. Guarded on
 * 'processing' so a concurrent reconciler can never be undone.
 */
async function releaseClaim(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  suggestionId: string,
  revertTo: OpenStatus,
): Promise<void> {
  const { error } = await supabase
    .from("planner_suggestions")
    .update({ status: revertTo, claimed_at: null, updated_at: new Date().toISOString() })
    .eq("id", suggestionId)
    .eq("organization_id", ctx.org.id)
    .eq("status", "processing");

  if (error) {
    // Not fatal: the suggestion stays 'processing' and the sweep releases it.
    console.error("[acceptPlannerSuggestion] release claim failed:", error.message);
  }
}

export type AcceptResult =
  | { ok: true; entityType: string; entityId: string; created: boolean }
  | { ok: false; error: string };

/**
 * Accept a suggestion → create the real Business OS entity through the EXISTING
 * module service, then record the outcome on the suggestion.
 *
 * Guarantees (spec §16, §6; Phase B security requirement #3):
 *   1. Tenant + status + permission checks before any write.
 *   2. proposed_payload is re-validated per suggestion_type (no mass assignment).
 *   3. Money safety: financial types route to createFinancialTask, which can
 *      never post a money transaction. This layer has no path to a posted
 *      expense/income.
 *   4. Once-only: the suggestion is CLAIMED (pending|edited -> 'processing') by a
 *      guarded UPDATE before the entity is created. Exactly one concurrent caller
 *      wins that transition, so a double click / retry / second tab cannot create
 *      two entities. A failed creation releases the claim (retryable); a crashed
 *      claim is repaired by reconcile_stuck_planner_suggestions (migration 094).
 *
 * Note the write order after a successful creation: accepted_entity_id lands
 * FIRST, the status flip second. That ordering is what lets the reconciler tell
 * "entity created, bookkeeping lost" apart from "never got that far".
 */
export async function acceptPlannerSuggestion(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  suggestionId: string,
): Promise<AcceptResult> {
  if (!canDo(ctx, "planner.suggestion.accept")) {
    return { ok: false, error: "Forbidden" };
  }

  // 1. Load (RLS already scopes to the org; the extra eq is defense in depth).
  //    This read is for the error message and the revert target only — the
  //    authoritative status check is the guarded claim below.
  const { data, error } = await supabase
    .from("planner_suggestions")
    .select(PLANNER_SUGGESTION_COLUMNS)
    .eq("id", suggestionId)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();

  if (error || !data) return { ok: false, error: "Suggestion not found" };
  const previous = data as PlannerSuggestion;

  if (!isOpenStatus(previous.status)) {
    return { ok: false, error: `Suggestion is already ${previous.status}` };
  }

  // 2. Claim it. `.in("status", OPEN)` makes this a compare-and-swap: the loser of
  //    a race updates zero rows and bails out without touching any module service.
  const claimedAt = new Date().toISOString();
  const { data: claimedRow, error: claimError } = await supabase
    .from("planner_suggestions")
    .update({ status: "processing", claimed_at: claimedAt, updated_at: claimedAt })
    .eq("id", suggestionId)
    .eq("organization_id", ctx.org.id)
    .in("status", PLANNER_SUGGESTION_OPEN_STATUSES)
    .select(PLANNER_SUGGESTION_COLUMNS)
    .maybeSingle();

  if (claimError) {
    console.error("[acceptPlannerSuggestion] claim failed:", claimError.message);
    return { ok: false, error: "Failed to accept suggestion" };
  }
  if (!claimedRow) {
    // Someone else claimed it between the read and the CAS, or it left the open
    // set entirely. Either way this caller must not create a second entity.
    return { ok: false, error: "This suggestion is already being processed" };
  }

  // Use the claimed row: it is the freshest copy (a concurrent edit may have
  // landed between the read and the claim).
  const suggestion = claimedRow as PlannerSuggestion;

  // 3. Permission for the target entity + route to the existing service.
  const outcome = await routeAccept(supabase, ctx, suggestion);
  if (!outcome.ok) {
    await releaseClaim(supabase, ctx, suggestion.id, previous.status);
    return outcome;
  }

  // 4a. Record the entity FIRST, while still 'processing'. If the process dies
  //     here, the reconciler sees accepted_entity_id and finalizes rather than
  //     re-opening the suggestion for a duplicate confirm.
  const { error: recordError } = await supabase
    .from("planner_suggestions")
    .update({
      accepted_entity_type: outcome.entityType,
      accepted_entity_id: outcome.entityId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", suggestion.id)
    .eq("organization_id", ctx.org.id)
    .eq("status", "processing");

  if (recordError) {
    // The entity exists. Do NOT release the claim — that would invite a duplicate.
    // Leave it 'processing' with a null entity id; the reconciler will release it
    // only after the timeout, and this is logged loudly for exactly that reason.
    console.error(
      "[acceptPlannerSuggestion] entity created but bookkeeping failed:",
      { suggestionId: suggestion.id, entityType: outcome.entityType, entityId: outcome.entityId },
      recordError.message,
    );
    return { ok: false, error: "Accepted, but the suggestion could not be updated" };
  }

  // 4b. Flip to the terminal status and drop the claim.
  await supabase
    .from("planner_suggestions")
    .update({ status: "accepted", claimed_at: null, updated_at: new Date().toISOString() })
    .eq("id", suggestion.id)
    .eq("organization_id", ctx.org.id)
    .eq("status", "processing");

  await supabase
    .from("planner_entries")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", suggestion.planner_entry_id)
    .eq("organization_id", ctx.org.id);

  // 4. Best-effort: emit the accepted event, resolve the Action Center review
  //    item. The link back to the origin capture lives on the suggestion row
  //    itself (accepted_entity_type/id) — planner_suggestion is intentionally not
  //    a verifiable entity_links type, so we don't fabricate an unverifiable link.
  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "planner_suggestion.accepted",
      aggregateType: "planner_suggestion",
      aggregateId: suggestion.id,
      payload: {
        suggestion_type: suggestion.suggestion_type,
        entity_type: outcome.entityType,
        entity_id: outcome.entityId,
      },
    }),
    resolvePlannerActionItems(supabase, ctx, [suggestion.id, suggestion.planner_entry_id]),
  ]);

  return outcome;
}

/**
 * Draw the relation a draft promised, from the source entity to the one that was
 * just created.
 *
 * Best-effort by necessity: the business entity already exists and a failed link
 * must not undo it, nor turn a successful confirm into an error the user would
 * retry (retrying would create a second entity). A missing link is repairable
 * from the relations UI; a duplicate task is not.
 */
async function drawSuggestedLink(
  ctx: CurrentContext,
  linkTo: SuggestionLinkTarget | undefined,
  createdType: string,
  createdId: string,
): Promise<void> {
  if (!linkTo) return;
  if (!canDo(ctx, "entity_link.create")) return;

  const res = await createEntityLink({
    sourceType: linkTo.entityType,
    sourceId: linkTo.entityId,
    targetType: createdType,
    targetId: createdId,
    linkType: linkTo.linkType,
    relationDirection: "direct",
    metadata: { source: "manual", via: "planner" },
  });

  if (!res.ok) {
    console.error("[acceptPlannerSuggestion] suggested link not created:", {
      from: `${linkTo.entityType}:${linkTo.entityId}`,
      to: `${createdType}:${createdId}`,
    });
  }
}

const FINANCIAL_CONTEXT_BY_TYPE: Partial<Record<PlannerSuggestionType, Exclude<TaskContextType, "standard">>> = {
  create_financial_task: "invoice_payment",
  create_money_reminder: "expense_review",
  create_subscription_reminder: "subscription_payment",
};

async function routeAccept(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  suggestion: PlannerSuggestion,
): Promise<AcceptResult> {
  const payload = suggestion.proposed_payload ?? {};

  switch (suggestion.suggestion_type) {
    case "create_task": {
      if (!canDo(ctx, "data.write")) return { ok: false, error: "Forbidden" };
      const parsed = createTaskPayloadSchema.safeParse({ title: suggestion.title, ...payload });
      if (!parsed.success) return { ok: false, error: "Invalid task payload" };
      // Task priority tops out at 'high'; map 'urgent' down.
      const priority = parsed.data.priority === "urgent" ? "high" : parsed.data.priority;
      const res = await createStandardTask(supabase, ctx, {
        title: parsed.data.title,
        description: parsed.data.description,
        priority,
        dueDate: parsed.data.dueDate ?? null,
      });
      if (!res.ok) return { ok: false, error: res.error };
      // Phase B / B3: the draft told the user "a link will be created". Draw it.
      await drawSuggestedLink(ctx, parsed.data.linkTo, "task", res.taskId);
      return { ok: true, entityType: "task", entityId: res.taskId, created: true };
    }

    case "create_financial_task":
    case "create_money_reminder":
    case "create_subscription_reminder": {
      if (!canDo(ctx, "data.write")) return { ok: false, error: "Forbidden" };
      const parsed = financialTaskPayloadSchema.safeParse({ title: suggestion.title, ...payload });
      if (!parsed.success) {
        return { ok: false, error: "Add a payment date (and amount) before accepting" };
      }
      const contextType = FINANCIAL_CONTEXT_BY_TYPE[suggestion.suggestion_type] ?? "invoice_payment";
      // Money-safe: createFinancialTask records a planned obligation only. A
      // posted expense can ONLY come later from an explicit Mark-as-paid.
      const res = await createFinancialTask(supabase, ctx, {
        contextType,
        title: parsed.data.title,
        providerName: parsed.data.providerName ?? null,
        amount: parsed.data.amount ?? null,
        currency: parsed.data.currency ?? null,
        financialDueDate: parsed.data.financialDueDate,
        reminderOffsetDays: parsed.data.reminderOffsetDays ?? DEFAULT_REMINDER_OFFSET_DAYS,
        sourceType: "manual",
        sourceId: suggestion.id,
        confidence: suggestion.confidence,
      });
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, entityType: "task", entityId: res.taskId, created: res.created };
    }

    case "link_entities": {
      if (!canDo(ctx, "entity_link.create")) return { ok: false, error: "Forbidden" };
      const parsed = linkEntitiesPayloadSchema.safeParse(payload);
      if (!parsed.success) return { ok: false, error: "Invalid link payload" };
      const res = await createEntityLink({
        sourceType: parsed.data.sourceType,
        sourceId: parsed.data.sourceId,
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId,
        linkType: parsed.data.linkType,
        relationDirection: "direct",
        metadata: { source: "manual", via: "planner" },
      });
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, entityType: "entity_link", entityId: res.data.id, created: true };
    }

    case "create_action_item": {
      if (!canDo(ctx, "data.write")) return { ok: false, error: "Forbidden" };
      const parsed = createActionItemPayloadSchema.safeParse({ title: suggestion.title, ...payload });
      if (!parsed.success) return { ok: false, error: "Invalid action item payload" };
      const res = await createActionItemForDocument(supabase, ctx, {
        // A distinct type from the review item ('ai_suggestion'/'missing_information')
        // keeps the (org, type, source_type, source_id) dedup key unique while
        // reusing the same UUID source_id (source_id is UUID NOT NULL).
        type: "approval_required",
        title: parsed.data.title,
        description: parsed.data.description,
        sourceType: "ai",
        sourceId: suggestion.id,
        primaryEntityType: "planner_suggestion",
        primaryEntityId: suggestion.id,
      });
      if (!res.ok || !res.actionItemId) return { ok: false, error: "Failed to create action item" };
      return { ok: true, entityType: "action_item", entityId: res.actionItemId, created: true };
    }

    // Not part of the MVP surface — accept safely refuses instead of guessing.
    case "create_document":
    case "assign_project":
    case "create_project":
    default:
      return {
        ok: false,
        error: "This suggestion type isn't supported yet — edit it into a task or reminder.",
      };
  }
}
