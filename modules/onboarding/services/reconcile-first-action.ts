import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import { createSourcedPlannerEntry, createPlannerSuggestion } from "@/modules/planner";
import { ONBOARDING_PROGRESS_COLUMNS, type FirstAction, type OnboardingProgress } from "../types/onboarding.types";
import { planFirstActionDraft, type FirstActionEntity } from "./plan-first-action-draft";
import { readProgress } from "./ensure-onboarding-progress";

/**
 * Advance the first-run funnel to match reality (Phase B / B2).
 *
 * Pull, not push. The three creation surfaces (documents, subscriptions, tasks)
 * are untouched: nothing in them knows the wizard exists. Instead this runs where
 * the user must return anyway — the Action Center — and asks "did the entity they
 * promised to create show up?". That buys three things for free:
 *
 *   - Phase B edge case #1: closing the wizard mid-flow loses nothing; the draft
 *     is seeded on the next dashboard visit and waits in the Action Center.
 *   - No hot-path cost on the creation actions, and no coupling to three modules.
 *   - Re-running is safe (see the claim below), so a double render is harmless.
 *
 * Two steps, at most one per call:
 *   1. entity appeared  -> seed the draft, stamp first_action_completed_at
 *   2. draft accepted   -> stamp first_workflow_completed_at (activation)
 */
export async function reconcileFirstAction(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  progress: OnboardingProgress,
): Promise<OnboardingProgress> {
  const action = progress.selected_first_action;
  if (!action || progress.dismissed_at || progress.first_workflow_completed_at) return progress;

  if (!progress.first_action_completed_at) {
    return completeFirstAction(supabase, ctx, progress, action);
  }
  return completeFirstWorkflow(supabase, ctx, progress);
}

// ── Step 1: the entity appeared ──────────────────────────────────────────────

async function completeFirstAction(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  progress: OnboardingProgress,
  action: FirstAction,
): Promise<OnboardingProgress> {
  const since = progress.selected_at;
  if (!since) return progress;

  // Capture is the one action that already produced its own draft: the Inbox runs
  // AI intent detection on submit. Nothing to seed — just find what it made.
  if (action === "capture_inbox_item") {
    const found = await findCapture(supabase, ctx, since);
    if (!found) return progress;
    return stampFirstAction(supabase, ctx, progress, found.entryId, found.draftId);
  }

  const entity = await findEntity(supabase, ctx, action, since);
  if (!entity) return progress;

  // Claim before seeding, so two parallel dashboard renders cannot both create a
  // capture + draft for the same entity. Same compare-and-swap discipline as
  // acceptPlannerSuggestion: the loser updates zero rows and stops.
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("onboarding_progress")
    .update({ first_action_completed_at: now, updated_at: now })
    .eq("id", progress.id)
    .is("first_action_completed_at", null)
    .select(ONBOARDING_PROGRESS_COLUMNS)
    .maybeSingle();

  if (claimError) {
    console.error("[reconcileFirstAction] claim failed:", claimError.message);
    return progress;
  }
  if (!claimed) {
    // Another render got there first; its seeded ids are the truth.
    return (await readProgress(supabase, ctx)) ?? progress;
  }

  const seeded = await seedDraft(supabase, ctx, entity);
  if (!seeded) {
    // Release the claim so the next render retries instead of stranding the user
    // on a "review your draft" step with no draft. Guarded on first_entry_id so a
    // claim that DID seed (and is racing us) is never reopened.
    await supabase
      .from("onboarding_progress")
      .update({ first_action_completed_at: null, updated_at: new Date().toISOString() })
      .eq("id", progress.id)
      .is("first_entry_id", null);
    return progress;
  }

  return stampSeeded(supabase, ctx, claimed as OnboardingProgress, seeded.entryId, seeded.draftId);
}

async function seedDraft(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  entity: FirstActionEntity,
): Promise<{ entryId: string; draftId: string } | null> {
  const entryResult = await createSourcedPlannerEntry(supabase, ctx, {
    entity: { kind: entity.kind, id: entity.id },
    summary: entity.kind === "subscription" ? entity.name : entity.title,
  });
  if (!entryResult.ok) return null;

  const draft = planFirstActionDraft(entity);
  const suggestionResult = await createPlannerSuggestion(supabase, ctx, entryResult.entry.id, draft);
  if (!suggestionResult.ok) return null;

  return { entryId: entryResult.entry.id, draftId: suggestionResult.suggestion.id };
}

// ── Step 2: the draft was confirmed ──────────────────────────────────────────

async function completeFirstWorkflow(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  progress: OnboardingProgress,
): Promise<OnboardingProgress> {
  if (!progress.first_draft_id) return progress;

  const { data: draft } = await supabase
    .from("planner_suggestions")
    .select("status")
    .eq("id", progress.first_draft_id)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();

  // Only a CONFIRMED draft is activation. A rejected or expired one leaves the
  // funnel open: the user still has first actions available from the Action
  // Center, and rejecting a suggestion is not a failure to onboard.
  if (!draft || draft.status !== "accepted") return progress;

  const now = new Date().toISOString();
  const { data: updated } = await supabase
    .from("onboarding_progress")
    .update({ first_workflow_completed_at: now, updated_at: now })
    .eq("id", progress.id)
    .is("first_workflow_completed_at", null)
    .select(ONBOARDING_PROGRESS_COLUMNS)
    .maybeSingle();

  if (!updated) return progress;

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "onboarding.first_workflow_completed",
    aggregateType: "onboarding_progress",
    aggregateId: progress.id,
    payload: {
      first_action: progress.selected_first_action,
      // The activation metric Phase B / B7 asks for, computed once at the moment
      // it becomes true rather than reconstructed from two timestamps later.
      seconds_to_activation: secondsBetween(progress.started_at, now),
    },
  });

  return updated as OnboardingProgress;
}

// ── Persistence helpers ──────────────────────────────────────────────────────

async function stampFirstAction(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  progress: OnboardingProgress,
  entryId: string,
  draftId: string | null,
): Promise<OnboardingProgress> {
  const now = new Date().toISOString();
  const { data: updated } = await supabase
    .from("onboarding_progress")
    .update({ first_action_completed_at: now, first_entry_id: entryId, first_draft_id: draftId, updated_at: now })
    .eq("id", progress.id)
    .is("first_action_completed_at", null)
    .select(ONBOARDING_PROGRESS_COLUMNS)
    .maybeSingle();

  if (!updated) return (await readProgress(supabase, ctx)) ?? progress;
  await emitFirstActionCompleted(ctx, progress, draftId);
  return updated as OnboardingProgress;
}

/** The claim already stamped the timestamp; record what it produced. */
async function stampSeeded(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  claimed: OnboardingProgress,
  entryId: string,
  draftId: string,
): Promise<OnboardingProgress> {
  const { data: updated } = await supabase
    .from("onboarding_progress")
    .update({ first_entry_id: entryId, first_draft_id: draftId, updated_at: new Date().toISOString() })
    .eq("id", claimed.id)
    .select(ONBOARDING_PROGRESS_COLUMNS)
    .maybeSingle();

  await emitFirstActionCompleted(ctx, claimed, draftId);
  return (updated as OnboardingProgress | null) ?? claimed;
}

async function emitFirstActionCompleted(
  ctx: CurrentContext,
  progress: OnboardingProgress,
  draftId: string | null,
): Promise<void> {
  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "onboarding.first_action_completed",
    aggregateType: "onboarding_progress",
    aggregateId: progress.id,
    payload: { first_action: progress.selected_first_action, draft_id: draftId },
  });
}

function secondsBetween(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
}

// ── Entity lookups ───────────────────────────────────────────────────────────

/**
 * The capture the user typed, plus whatever the AI proposed for it. A capture
 * whose detection failed has no suggestion; the funnel still advances, and the
 * Action Center already carries a missing-information item for it.
 */
async function findCapture(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  since: string,
): Promise<{ entryId: string; draftId: string | null } | null> {
  const { data: entry } = await supabase
    .from("planner_entries")
    .select("id")
    .eq("organization_id", ctx.org.id)
    .eq("created_by", ctx.user.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!entry) return null;

  const { data: draft } = await supabase
    .from("planner_suggestions")
    .select("id")
    .eq("organization_id", ctx.org.id)
    .eq("planner_entry_id", entry.id as string)
    .in("status", ["pending", "edited"])
    .order("confidence", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { entryId: entry.id as string, draftId: (draft?.id as string | undefined) ?? null };
}

async function findEntity(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  action: Exclude<FirstAction, "capture_inbox_item">,
  since: string,
): Promise<FirstActionEntity | null> {
  switch (action) {
    case "upload_document": {
      const { data } = await supabase
        .from("documents")
        .select("id, title")
        .eq("organization_id", ctx.org.id)
        .eq("created_by", ctx.user.id)
        .is("deleted_at", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ? { kind: "document", id: data.id as string, title: data.title as string } : null;
    }

    case "add_subscription": {
      const { data } = await supabase
        .from("subscriptions")
        .select("id, name")
        .eq("organization_id", ctx.org.id)
        .eq("created_by", ctx.user.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ? { kind: "subscription", id: data.id as string, name: data.name as string } : null;
    }

    case "create_task": {
      const { data } = await supabase
        .from("todos")
        .select("id, title")
        .eq("organization_id", ctx.org.id)
        .eq("created_by", ctx.user.id)
        // Creating a subscription auto-provisions a payment task. Without this
        // filter that task would masquerade as "the user created a task".
        .eq("task_context_type", "standard")
        .is("deleted_at", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return null;

      return {
        kind: "task",
        id: data.id as string,
        title: data.title as string,
        linkCandidate: await findLinkCandidate(supabase, ctx),
      };
    }
  }
}

/** The newest document in the org — the natural context for a bare task. */
async function findLinkCandidate(
  supabase: SupabaseClient,
  ctx: CurrentContext,
): Promise<{ entityType: "document"; entityId: string; label: string } | null> {
  const { data } = await supabase
    .from("documents")
    .select("id, title")
    .eq("organization_id", ctx.org.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? { entityType: "document", entityId: data.id as string, label: data.title as string } : null;
}
