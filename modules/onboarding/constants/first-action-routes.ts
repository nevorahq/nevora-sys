import { ROUTES } from "@/shared/config/routes";
import type { FirstAction } from "../types/onboarding.types";

/**
 * Where each first action is actually performed. Onboarding owns no creation
 * forms — the wizard tiles (B2) and the empty-state CTAs (B6) both deep-link into
 * the module that already owns that form, so there is exactly one place a
 * document, subscription or task can be created.
 */
export const FIRST_ACTION_ROUTE: Record<FirstAction, string> = {
  upload_document: ROUTES.documentsNew,
  add_subscription: ROUTES.subscriptions,
  create_task: ROUTES.tasks,
  capture_inbox_item: ROUTES.inbox,
};
