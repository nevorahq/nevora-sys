import type { ActionItemType, ActionSourceType, PhaseBSection } from "../types/action-item.types";
import type { ActionFeedItem, ActionFeedSections } from "../types/action-center.types";

/**
 * Phase B / B5 — the Action Center as a daily screen.
 *
 * The feed already groups items by their technical type (due_soon /
 * waiting_for_action / missing_information / ai_suggestions). That is a taxonomy,
 * not an answer to "what should I do next?". Phase B asks for three sections that
 * answer it, and one priority order across all of them:
 *
 *   1. drafts requiring confirmation
 *   2. overdue payment / subscription follow-ups
 *   3. recently captured inbox items
 *   4. unlinked documents
 *   5. normal tasks
 *
 * Pure and presentational: this regroups an already-fetched page. It deliberately
 * does NOT touch the query, so keyset pagination, filters and bulk-select keep
 * working exactly as before.
 */

/**
 * The BASE section for an item type, ignoring what entity it is about. Exhaustive
 * by construction: adding an ActionItemType without placing it here is a compile
 * error, so a new signal can never quietly vanish from the daily screen.
 *
 * Three anchors:
 *   - "does this need a decision from me?" → needs_your_review (a draft, a missing
 *     link, an unassigned item all wait on a human choice);
 *   - "is this money?" → money_attention (payment_required / renewal_required are
 *     financial by definition, whatever their source);
 *   - "is this work to carry out?" → next_actions (a due task waits on effort).
 *
 * Types that are only SOMETIMES about money (a draft_review or missing_information
 * ON a transaction) anchor to review/work here and are re-routed to money_attention
 * per-item by `phaseBSectionOfItem` below, based on the item's source/primary entity.
 */
const SECTION_BY_TYPE: Record<ActionItemType, Exclude<PhaseBSection, "recently_updated">> = {
  // Awaiting a human decision.
  approval_required: "needs_your_review",
  draft_review: "needs_your_review",
  ai_suggestion: "needs_your_review",
  risk_detected: "needs_your_review",
  missing_information: "needs_your_review",
  missing_relation: "needs_your_review",
  assignment_required: "needs_your_review",

  // Money by definition, regardless of source.
  payment_required: "money_attention",
  renewal_required: "money_attention",

  // Awaiting work.
  overdue: "next_actions",
  due_soon: "next_actions",
  document_review: "next_actions",
  follow_up_required: "next_actions",
};

/**
 * An item belongs in Money Attention when it is financial. The signal is drawn
 * only from fields the item already carries (§9 adds no data model):
 *   - its type is payment_required / renewal_required (money by definition), or
 *   - its source or primary entity is a transaction or a subscription — which is
 *     how the generators stamp every money signal: a document-derived draft expense
 *     (`draft_review`, source `transaction`), an uncategorized/unusual transaction
 *     (`missing_information` / `risk_detected`, source `transaction`), an upcoming
 *     subscription payment (`renewal_required` / `payment_required`, source
 *     `subscription`), a payment cycle awaiting confirmation, and so on.
 */
const MONEY_SOURCE_TYPES: ReadonlySet<ActionSourceType> = new Set(["transaction", "subscription"]);
const MONEY_ENTITY_TYPES: ReadonlySet<string> = new Set(["transaction", "subscription"]);

export function isMoneyAttentionItem(
  item: Pick<ActionFeedItem, "type" | "source_type" | "primary_entity_type">,
): boolean {
  return (
    SECTION_BY_TYPE[item.type] === "money_attention" ||
    MONEY_SOURCE_TYPES.has(item.source_type) ||
    (item.primary_entity_type !== null && MONEY_ENTITY_TYPES.has(item.primary_entity_type))
  );
}

/**
 * The actual section for a concrete item: Money Attention wins over the base
 * type anchor, so a draft_review ON a transaction lands in Money Attention while a
 * draft_review on anything else stays in Needs your review.
 */
export function phaseBSectionOfItem(
  item: Pick<ActionFeedItem, "type" | "source_type" | "primary_entity_type">,
): Exclude<PhaseBSection, "recently_updated"> {
  return isMoneyAttentionItem(item) ? "money_attention" : SECTION_BY_TYPE[item.type];
}

/**
 * The Phase B priority order, 1 (most urgent) to 5. Applied within a section, so
 * a confirmable draft always sits above a stale inbox item, and an overdue
 * payment always sits above a task that is merely due.
 */
const RANK_BY_TYPE: Record<ActionItemType, number> = {
  // 1 — a draft the user must confirm or reject before anything happens.
  approval_required: 1,
  draft_review: 1,
  ai_suggestion: 1,

  // 2 — money that is already late, and the risks that behave like it.
  overdue: 2,
  payment_required: 2,
  renewal_required: 2,
  risk_detected: 2,

  // 3 — captures waiting to be turned into something.
  missing_information: 3,

  // 4 — objects that exist but sit outside the graph.
  missing_relation: 4,
  document_review: 4,
  assignment_required: 4,

  // 5 — ordinary work.
  due_soon: 5,
  follow_up_required: 5,
};

export function phaseBRank(type: ActionItemType): number {
  return RANK_BY_TYPE[type];
}

/** The base (type-only) section anchor — used by the exhaustiveness test. Actual
 * placement of a concrete item goes through `phaseBSectionOfItem`. */
export function phaseBSectionOf(type: ActionItemType): Exclude<PhaseBSection, "recently_updated"> {
  return SECTION_BY_TYPE[type];
}

export type PhaseBFeedSections = Record<PhaseBSection, ActionFeedItem[]>;

/**
 * Regroup a fetched feed page into the four Phase B sections.
 *
 * `recently_updated` is fed by the query's `recently_resolved` bucket, which until
 * now was fetched, hydrated — and never rendered. `money_attention` (§9) is filled
 * per-item, not per-type, so a financial draft leaves review and a financial
 * follow-up leaves next-actions — grouped by what the SMB actually asks about money.
 */
export function groupPhaseBSections(sections: ActionFeedSections): PhaseBFeedSections {
  const grouped: PhaseBFeedSections = {
    needs_your_review: [],
    money_attention: [],
    next_actions: [],
    recently_updated: sections.recently_resolved,
  };

  const active = [
    ...sections.due_soon,
    ...sections.waiting_for_action,
    ...sections.missing_information,
    ...sections.ai_suggestions,
  ];

  for (const item of active) {
    grouped[phaseBSectionOfItem(item)].push(item);
  }

  grouped.needs_your_review.sort(byUrgency);
  grouped.money_attention.sort(byUrgency);
  grouped.next_actions.sort(byUrgency);

  return grouped;
}

/**
 * Rank first (that is the Phase B contract), then the engine's own score, then
 * the soonest deadline, then newest. Every tie-break is total, so the order is
 * stable across renders — a list that reshuffles under the cursor is worse than
 * a list in the wrong order.
 */
function byUrgency(a: ActionFeedItem, b: ActionFeedItem): number {
  const rank = phaseBRank(a.type) - phaseBRank(b.type);
  if (rank !== 0) return rank;

  const score = b.priority_score - a.priority_score;
  if (score !== 0) return score;

  const due = compareDueAt(a.due_at, b.due_at);
  if (due !== 0) return due;

  // Newest first, then id as the final deterministic tie-break.
  const created = b.created_at.localeCompare(a.created_at);
  return created !== 0 ? created : a.id.localeCompare(b.id);
}

/** An item with no deadline cannot be more urgent than one that has one. */
function compareDueAt(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}
