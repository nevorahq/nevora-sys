"use server";

import { revalidatePath } from "next/cache";
import { deleteRelation } from "../services/relation.service";
import type { RelationActionResult } from "../types/relation.types";

/**
 * Server Action: soft-delete связи.
 *
 * Только server-side. Permission/cross-tenant/event/audit — внутри сервиса
 * и lib/deleteEntityLink. revalidatePath обновляет viewer на detail-странице.
 */
export async function deleteEntityRelation(
  input: { relationId: string },
  revalidate?: string,
): Promise<RelationActionResult<{ id: string }>> {
  const res = await deleteRelation(input);
  if (res.ok && revalidate?.startsWith("/dashboard")) {
    revalidatePath(revalidate);
  }
  return res;
}
