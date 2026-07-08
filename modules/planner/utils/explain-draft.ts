import {
  confidenceBand,
  isFinancialSuggestionType,
  type ConfidenceBand,
  type PlannerEntry,
  type PlannerSuggestion,
  type PlannerSuggestionType,
} from "../types/planner.types";

/**
 * Turn a draft into the four things Phase B / B3 requires the review UI to show
 * BEFORE the user confirms:
 *
 *   1. what Nevora proposes      -> actionType
 *   2. why it is proposed        -> origin + band
 *   3. what data will change     -> effects
 *   4. what links will be created-> effects of kind 'link'
 *
 * Pure and UI-free: it emits descriptors, not sentences, so the copy stays in the
 * dictionaries and both locales tell the same story. Deriving the effects from
 * the SAME payload the accept path re-validates is the point — a card that
 * described something other than what confirm does would be worse than no card.
 */

export type DraftEffect =
  /** A new business entity will be created. */
  | { kind: "create"; entityType: "task" | "financial_task" | "action_item" }
  /** A relation will be drawn between two entities. */
  | { kind: "link"; fromType: string; toType: string }
  /** The confirm creates no new records at all (pure relation drafts). */
  | { kind: "no_new_data" };

export type DraftOrigin =
  /** AI read the user's typed capture. */
  | { kind: "ai_detection"; intent: string | null }
  /** A business entity seeded the draft (First Action Wizard, document upload…). */
  | { kind: "source_entity"; sourceType: PlannerEntry["source"]; label: string | null }
  /** Neither — the capture exists but carries no intent or source we can name. */
  | { kind: "manual_capture" };

export interface DraftExplanation {
  actionType: PlannerSuggestionType;
  origin: DraftOrigin;
  band: ConfidenceBand;
  effects: DraftEffect[];
  /**
   * True for the financial suggestion types. The UI must state plainly that
   * confirming records an obligation and never posts a transaction — the single
   * most important promise this product makes (spec §6, Phase B safety rule 7).
   */
  moneySafe: boolean;
  /**
   * The accept path refuses these types. Surfacing it here stops the user from
   * discovering it only after pressing Confirm.
   */
  unsupported: boolean;
}

/** Types routeAccept() knows how to execute. Everything else fails on confirm. */
const SUPPORTED_TYPES: readonly PlannerSuggestionType[] = [
  "create_task",
  "create_financial_task",
  "create_money_reminder",
  "create_subscription_reminder",
  "link_entities",
  "create_action_item",
];

export function explainDraft(
  suggestion: PlannerSuggestion,
  entry: Pick<PlannerEntry, "source" | "raw_text" | "ai_detected_intent"> | null,
): DraftExplanation {
  return {
    actionType: suggestion.suggestion_type,
    origin: deriveOrigin(entry),
    band: confidenceBand(suggestion.confidence),
    effects: deriveEffects(suggestion),
    moneySafe: isFinancialSuggestionType(suggestion.suggestion_type),
    unsupported: !SUPPORTED_TYPES.includes(suggestion.suggestion_type),
  };
}

function deriveOrigin(
  entry: Pick<PlannerEntry, "source" | "raw_text" | "ai_detected_intent"> | null,
): DraftOrigin {
  if (!entry) return { kind: "manual_capture" };

  // A capture seeded by a real entity names that entity; raw_text holds its label
  // (see createSourcedPlannerEntry).
  if (entry.source !== "manual" && entry.source !== "system") {
    return { kind: "source_entity", sourceType: entry.source, label: entry.raw_text };
  }

  if (entry.ai_detected_intent) {
    return { kind: "ai_detection", intent: entry.ai_detected_intent };
  }

  return { kind: "manual_capture" };
}

function deriveEffects(suggestion: PlannerSuggestion): DraftEffect[] {
  const payload = suggestion.proposed_payload ?? {};

  switch (suggestion.suggestion_type) {
    case "create_task": {
      const effects: DraftEffect[] = [{ kind: "create", entityType: "task" }];
      const link = readLinkTo(payload);
      if (link) effects.push({ kind: "link", fromType: link.entityType, toType: "task" });
      return effects;
    }

    case "create_financial_task":
    case "create_money_reminder":
    case "create_subscription_reminder":
      return [{ kind: "create", entityType: "financial_task" }];

    case "link_entities": {
      const from = typeof payload.sourceType === "string" ? payload.sourceType : null;
      const to = typeof payload.targetType === "string" ? payload.targetType : null;
      if (!from || !to) return [{ kind: "no_new_data" }];
      // A relation draft touches no records beyond the link itself.
      return [{ kind: "link", fromType: from, toType: to }, { kind: "no_new_data" }];
    }

    case "create_action_item":
      return [{ kind: "create", entityType: "action_item" }];

    // Types the accept path refuses. Promising an effect here would be a lie.
    case "create_document":
    case "assign_project":
    case "create_project":
    default:
      return [];
  }
}

/** Mirrors suggestionLinkTargetSchema without paying for a zod parse per render. */
function readLinkTo(payload: Record<string, unknown>): { entityType: string } | null {
  const linkTo = payload.linkTo;
  if (!linkTo || typeof linkTo !== "object") return null;
  const entityType = (linkTo as { entityType?: unknown }).entityType;
  return typeof entityType === "string" && entityType.length > 0 ? { entityType } : null;
}
