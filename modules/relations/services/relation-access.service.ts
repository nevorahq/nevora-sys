import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyEntityOrganization } from "@/lib/entity-links/verify-entity-organization";
import type { EntityKind } from "../constants/relation.constants";

/**
 * Cross-tenant guard продуктового слоя.
 *
 * Проверяет, что сущность существует и принадлежит active organization,
 * прежде чем отдавать её связи или связывать. Делегирует в lib-примитив
 * verifyEntityOrganization (whitelist таблиц + scope по organization_id),
 * чтобы логика проверки жила в одном месте.
 */
export async function assertEntityInOrg(
  supabase: SupabaseClient,
  organizationId: string,
  type: EntityKind,
  id: string,
): Promise<boolean> {
  return verifyEntityOrganization(supabase, organizationId, type, id);
}
