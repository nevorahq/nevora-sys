import type { DetectedSuggestion } from "@/modules/planner";

/**
 * Decide which draft Nevora proposes after a first action (Phase B / B2).
 *
 * Pure and deterministic on purpose. Phase B explicitly excludes "extended AI
 * reasoning" and "autonomous actions" from scope, and the first thing a new user
 * sees must not depend on a model round-trip that can be slow, unavailable, or
 * surprising. The Capture Inbox already runs AI detection for typed input; a
 * first action on a *known entity* needs no inference — the useful next step is
 * obvious from the entity itself.
 *
 * Money safety: none of these drafts can post a transaction. The strongest thing
 * a confirm can do here is create a task, an action item, or a relation.
 */

/** The entity a first action produced, with only the fields a draft needs. */
export type FirstActionEntity =
  | { kind: "document"; id: string; title: string }
  | { kind: "subscription"; id: string; name: string }
  | {
      kind: "task";
      id: string;
      title: string;
      /** Newest document in the org, if any — the natural thing to link a task to. */
      linkCandidate: { entityType: "document"; entityId: string; label: string } | null;
    };

/**
 * Deliberately moderate. These drafts are rule-derived, not inferred, so a high
 * score would overstate certainty; the review UI bands on this value.
 */
const RULE_DERIVED_CONFIDENCE = 0.6;

export function planFirstActionDraft(entity: FirstActionEntity): DetectedSuggestion {
  switch (entity.kind) {
    // A freshly uploaded document almost always implies one thing: somebody has
    // to read it and act. Confirming creates that task AND the document → task
    // link, which is the Phase B loop in one step.
    case "document":
      return {
        suggestionType: "create_task",
        title: truncateTitle(`Review “${entity.title}”`),
        description: "Nevora prepared this from your document. Confirming creates the task and links it back to the document.",
        proposedPayload: {
          linkTo: {
            entityType: "document",
            entityId: entity.id,
            linkType: "requires_action_task",
          },
        },
        confidence: RULE_DERIVED_CONFIDENCE,
      };

    // The payment task already exists — createSubscriptionAction provisions the
    // first payment cycle. Proposing another payment reminder would duplicate it.
    // What is genuinely missing is the decision the user has to make BEFORE the
    // renewal: keep it or drop it.
    case "subscription":
      return {
        suggestionType: "create_task",
        title: truncateTitle(`Review renewal terms for ${entity.name}`),
        description: "Nevora prepared this from your subscription. Confirming creates the task and links it to the subscription. Your payment reminder is already scheduled — this does not duplicate it.",
        proposedPayload: {
          linkTo: {
            entityType: "subscription",
            entityId: entity.id,
            linkType: "renewal_task",
          },
        },
        confidence: RULE_DERIVED_CONFIDENCE,
      };

    // A task that arrived on its own has no context yet. If the org already has a
    // document, offering the link is the highest-value next step and needs no new
    // entity. Otherwise the only honest offer is to surface the task where the
    // user will see it again.
    case "task":
      if (entity.linkCandidate) {
        return {
          suggestionType: "link_entities",
          title: truncateTitle(`Link “${entity.title}” to “${entity.linkCandidate.label}”`),
          description: "Nevora noticed a document that may be the context for this task. Confirming creates the link — no new data.",
          proposedPayload: {
            sourceType: entity.linkCandidate.entityType,
            sourceId: entity.linkCandidate.entityId,
            targetType: "task",
            targetId: entity.id,
            linkType: "requires_action_task",
          },
          confidence: RULE_DERIVED_CONFIDENCE,
        };
      }
      return {
        suggestionType: "create_action_item",
        title: truncateTitle(`Follow up on “${entity.title}”`),
        description: "Confirming surfaces this task in your Action Center so it comes back to you instead of going quiet.",
        proposedPayload: {},
        confidence: RULE_DERIVED_CONFIDENCE,
      };
  }
}

/** planner_suggestions.title is capped at PLANNER_TITLE_MAX_LENGTH (200). */
const TITLE_MAX = 200;

function truncateTitle(title: string): string {
  return title.length <= TITLE_MAX ? title : `${title.slice(0, TITLE_MAX - 1)}…`;
}
