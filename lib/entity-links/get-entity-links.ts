"use server";

import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { getEntityLinksSchema } from "./entity-link.schema";
import {
  ENTITY_LINK_COLUMNS,
  type EntityLink,
  type GetEntityLinksInput,
  type EntityLinkResult,
} from "./entity-link.types";

/**
 * Получить связи по source- или target-сущности.
 *
 * Всегда scope по organization_id из серверного контекста + RLS.
 * Не использует select("*") — только whitelisted колонки.
 */
export async function getEntityLinks(
  input: GetEntityLinksInput,
): Promise<EntityLinkResult<EntityLink[]>> {
  const parsed = getEntityLinksSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid query",
    };
  }

  const ctx = await requireOrg();
  if (!canDo(ctx, "entity_link.read")) {
    return { ok: false, error: "Forbidden" };
  }

  const supabase = await createClient();

  let query = supabase
    .from("entity_links")
    .select(ENTITY_LINK_COLUMNS)
    .eq("organization_id", ctx.org.id);

  if (parsed.data.source) {
    query = query
      .eq("source_type", parsed.data.source.type)
      .eq("source_id", parsed.data.source.id);
  }

  if (parsed.data.target) {
    query = query
      .eq("target_type", parsed.data.target.type)
      .eq("target_id", parsed.data.target.id);
  }

  if (parsed.data.linkType) {
    query = query.eq("link_type", parsed.data.linkType);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("[getEntityLinks] failed:", error.message);
    return { ok: false, error: "Failed to load entity links" };
  }

  return { ok: true, data: (data ?? []) as EntityLink[] };
}
