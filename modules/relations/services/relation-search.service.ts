import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { searchRelationCandidatesSchema } from "../schemas/relation.schema";
import { searchCandidates } from "../queries/search-relation-candidates.query";
import type { RelationActionResult, RelationCandidate } from "../types/relation.types";

export interface SearchRelationCandidatesInput {
  targetTypes: string[];
  query?: string;
  limit?: number;
  excludeId?: string;
}

/**
 * Найти кандидатов для связывания.
 *
 * Security: requireOrg (org из серверного контекста), permission
 * entity_link.read, поиск всегда tenant-scoped + RLS. organization_id
 * никогда не приходит от клиента.
 */
export async function searchRelationCandidatesService(
  input: SearchRelationCandidatesInput,
): Promise<RelationActionResult<RelationCandidate[]>> {
  const parsed = searchRelationCandidatesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid search input" };
  }

  const ctx = await requireOrg();
  if (!canDo(ctx, "entity_link.read")) {
    return { ok: false, error: "Forbidden" };
  }

  const supabase = await createClient();
  const data = await searchCandidates(
    supabase,
    ctx.org.id,
    parsed.data.targetTypes,
    parsed.data.query,
    parsed.data.limit,
    parsed.data.excludeId,
  );

  return { ok: true, data };
}
