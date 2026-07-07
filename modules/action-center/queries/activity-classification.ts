/**
 * Activity classification — the TypeScript mirror of the SQL classifier in
 * migration 087 (public.domain_event_activity_type). The database is the source
 * of truth for access control; this copy lets the UI group events into sections
 * and gives us a fast unit-regression against the same mapping.
 *
 * KEEP IN SYNC with supabase/migrations/087_data_isolation_activity_visibility.sql.
 *
 *   business  → org records, visible to every active member.
 *   personal  → the actor's own quiet activity, visible only to created_by.
 *   security  → audit trail, visible only to owner/admin.
 *   system    → background jobs, never surfaced in the user UI (RLS hides them).
 */

export const ACTIVITY_TYPES = ["business", "personal", "security", "system"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type Visibility = "organization" | "private" | "system";

export function activityTypeForEvent(eventName: string): ActivityType {
  // personal — the actor's own quiet activity
  if (
    eventName.startsWith("planner_entry.") ||
    eventName.startsWith("planner_suggestion.") ||
    eventName.startsWith("money.ai_suggestion.") ||
    eventName === "recommendation.dismissed"
  ) {
    return "personal";
  }

  // security — audit trail (owner/admin only)
  if (
    eventName.startsWith("member.") ||
    eventName.startsWith("billing.") ||
    eventName === "org.created" ||
    eventName === "org.updated" ||
    eventName === "workspace.created"
  ) {
    return "security";
  }

  // system — background jobs (never in the user UI)
  if (
    eventName.startsWith("document.extraction.") ||
    eventName === "document.financial_data_extracted" ||
    eventName === "money.transaction.categorization_requested" ||
    eventName === "money.transaction.auto_categorization_requested" ||
    eventName === "action_center.item_created"
  ) {
    return "system";
  }

  return "business";
}

export function visibilityForEvent(eventName: string): Visibility {
  switch (activityTypeForEvent(eventName)) {
    case "personal":
      return "private";
    case "system":
      return "system";
    default:
      return "organization";
  }
}
