"use server";

import { getActionCenterFeed } from "../queries/get-action-center-feed";
import type { ActionFeed, ActionFilters } from "../types/action-center.types";

/** Server Action: фид Action Center для клиентской фильтрации/пагинации. */
export async function getActionFeed(filters: ActionFilters = {}): Promise<ActionFeed> {
  return getActionCenterFeed(filters);
}
