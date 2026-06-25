"use server";

import { getActionItemById } from "../queries/get-action-item-by-id";
import type { ActionDetail } from "../types/action-center.types";

/** Server Action: полная карточка action item для Detail Drawer (client). */
export async function getActionDetail(actionItemId: string): Promise<ActionDetail | null> {
  return getActionItemById(actionItemId);
}
