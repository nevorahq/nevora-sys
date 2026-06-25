import type {
  ActionItemType,
  ActionSection,
  ActionSourceType,
} from "../types/action-item.types";

export const SECTION_LABELS: Record<ActionSection, string> = {
  due_soon: "Due Soon",
  waiting_for_action: "Waiting For Action",
  missing_information: "Missing Information",
  ai_suggestions: "AI Suggestions",
  recently_resolved: "Recently Resolved",
};

export const SECTION_ORDER: ActionSection[] = [
  "due_soon",
  "waiting_for_action",
  "missing_information",
  "ai_suggestions",
  "recently_resolved",
];

export const TYPE_LABELS: Record<ActionItemType, string> = {
  approval_required: "Approval required",
  due_soon: "Due soon",
  overdue: "Overdue",
  missing_information: "Missing information",
  missing_relation: "Missing link",
  draft_review: "Draft review",
  ai_suggestion: "AI suggestion",
  risk_detected: "Risk detected",
  payment_required: "Payment required",
  renewal_required: "Renewal",
  assignment_required: "Needs assignee",
  document_review: "Document review",
  follow_up_required: "Follow-up",
};

export const SOURCE_LABELS: Record<ActionSourceType, string> = {
  task: "Task",
  document: "Document",
  transaction: "Money",
  subscription: "Subscription",
  crm: "CRM",
  automation: "Automation",
  ai: "AI",
  system: "System",
};
