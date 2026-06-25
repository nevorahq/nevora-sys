"use server";

import { revalidatePath } from "next/cache";
import {
  createRelation,
  type CreateRelationInput,
} from "../services/relation.service";
import type { RelationActionResult } from "../types/relation.types";

/**
 * Server Action: создать связь между двумя сущностями.
 *
 * Только server-side. organization_id НЕ принимается от клиента — резолвится
 * в requireOrg() внутри сервиса. Permission/cross-tenant/Zod/events/audit —
 * в сервисе и lib. Возвращает typed result; ошибки безопасны (без утечки
 * чужих данных).
 *
 * `revalidatePath` нужен, чтобы UniversalRelationViewer на detail-странице
 * обновился после мутации (наряду с router.refresh() на клиенте).
 */
export async function createEntityRelation(
  input: CreateRelationInput,
  revalidate?: string,
): Promise<RelationActionResult<{ id: string }>> {
  const res = await createRelation(input);
  if (res.ok && revalidate?.startsWith("/dashboard")) {
    revalidatePath(revalidate);
  }
  return res;
}
