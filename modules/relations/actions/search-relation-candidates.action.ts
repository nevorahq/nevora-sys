"use server";

import {
  searchRelationCandidatesService,
  type SearchRelationCandidatesInput,
} from "../services/relation-search.service";
import type { RelationActionResult, RelationCandidate } from "../types/relation.types";

/**
 * Server Action: поиск кандидатов для связывания (для RelationSearchDialog).
 *
 * Только server-side, tenant-scoped. organization_id резолвится на сервере.
 */
export async function searchRelationCandidates(
  input: SearchRelationCandidatesInput,
): Promise<RelationActionResult<RelationCandidate[]>> {
  return searchRelationCandidatesService(input);
}
