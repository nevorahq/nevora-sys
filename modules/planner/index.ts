// Capture Inbox — the thin input layer of Nevora Business OS.
//
// raw input -> planner_entry -> AI intent -> planner_suggestion -> accept/edit/reject
//           -> EXISTING module service -> entity_links + domain_events + action_items
//
// This module never owns business logic and never posts a money transaction.

// Types
export {
  PLANNER_ENTRY_TYPES,
  PLANNER_ENTRY_SOURCES,
  PLANNER_ENTRY_STATUSES,
  PLANNER_SUGGESTION_TYPES,
  PLANNER_SUGGESTION_STATUSES,
  FINANCIAL_SUGGESTION_TYPES,
  isFinancialSuggestionType,
  SUGGESTION_READY_FLOOR,
  SUGGESTION_SUGGEST_FLOOR,
  confidenceBand,
  INBOX_TABS,
} from "./types/planner.types";
export type {
  PlannerEntry,
  PlannerEntryType,
  PlannerEntrySource,
  PlannerEntryStatus,
  PlannerSuggestion,
  PlannerSuggestionType,
  PlannerSuggestionStatus,
  PlannerIntentDetectionResult,
  DetectedSuggestion,
  ConfidenceBand,
  InboxTab,
  InboxDashboardData,
  PlannerEntryWithSuggestions,
} from "./types/planner.types";

// Schemas
export {
  createPlannerEntrySchema,
  updatePlannerEntrySchema,
  deletePlannerEntrySchema,
  PLANNER_RAW_TEXT_MAX_LENGTH,
} from "./schemas/planner-entry.schema";
export type {
  CreatePlannerEntryInput,
  UpdatePlannerEntryInput,
  DeletePlannerEntryInput,
} from "./schemas/planner-entry.schema";
export {
  acceptPlannerSuggestionSchema,
  editPlannerSuggestionSchema,
  rejectPlannerSuggestionSchema,
  plannerIntentDetectionSchema,
} from "./schemas/planner-suggestion.schema";

// Services
export { detectPlannerIntent } from "./services/detect-planner-intent";
export { createPlannerEntry } from "./services/create-planner-entry";
export { processPlannerEntry } from "./services/process-planner-entry";
export { createPlannerSuggestion } from "./services/create-planner-suggestion";
export { acceptPlannerSuggestion } from "./services/accept-planner-suggestion";
export { editPlannerSuggestion } from "./services/edit-planner-suggestion";
export { rejectPlannerSuggestion } from "./services/reject-planner-suggestion";

// Utils
export { normalizePlannerIntent } from "./utils/normalize-planner-intent";

// Queries
export { getPlannerEntries } from "./queries/get-planner-entries";
export { getPlannerSuggestions } from "./queries/get-planner-suggestions";
export { getInboxDashboardData } from "./queries/get-inbox-dashboard-data";

// Actions
export { createPlannerEntryAction } from "./actions/create-planner-entry.action";
export { updatePlannerEntryAction } from "./actions/update-planner-entry.action";
export { deletePlannerEntryAction } from "./actions/delete-planner-entry.action";
export { acceptPlannerSuggestionAction } from "./actions/accept-planner-suggestion.action";
export { editPlannerSuggestionAction } from "./actions/edit-planner-suggestion.action";
export { rejectPlannerSuggestionAction } from "./actions/reject-planner-suggestion.action";

// Components
export { InboxPage } from "./components/inbox-page";
export { CaptureInput } from "./components/capture-input";
