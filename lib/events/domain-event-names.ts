export const DOMAIN_EVENT_NAMES = [
  "task.created", "task.updated", "task.completed", "task.reopened", "task.deleted", "task.assigned", "task.due_date_changed",
  "client.created", "client.updated", "client.deleted", "deal.created", "deal.updated", "deal.stage_changed", "deal.won", "deal.lost", "deal.deleted",
  "payment.received", "payment.sent", "money.transaction.created", "money.transaction.updated", "transaction.deleted", "account.created", "account.updated", "account.deactivated", "category.created",
  "subscription.created", "subscription.updated", "subscription.deleted", "subscription.renewed", "subscription.expired", "subscription.plan_changed", "subscription.canceled",
  "report.created", "snapshot.created", "insights.generated", "recommendations.generated", "summary.generated", "recommendation.dismissed",
  "document.created", "document.updated", "document.deleted", "document.attachment_uploaded", "document.linked",
  "org.created", "org.updated", "member.invited", "member.joined", "member.removed", "member.role_changed", "workspace.created",
  "booking.requested", "booking.request.accepted", "booking.request.rejected", "booking.request.canceled", "booking.host_profile.created", "booking.host_profile.updated", "booking.service.created", "booking.availability.updated", "crm.lead.created_from_booking", "booking.request.linked_to_crm_lead",
  "relation.created", "relation.deleted", "relation.updated", "relation.auto_created", "relation.suggested",
  "action_item.created", "action_item.assigned", "action_item.snoozed", "action_item.resolved", "action_item.dismissed", "action_item.executed", "action_item.failed",
] as const;

export type DomainEventName = (typeof DOMAIN_EVENT_NAMES)[number];
