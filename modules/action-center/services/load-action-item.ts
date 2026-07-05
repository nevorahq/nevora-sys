import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionItem } from "../types/action-item.types";

const MUTATION_COLUMNS =
  "id, organization_id, status, type, source_type, source_id, primary_entity_id, title, assigned_to, metadata" as const;

export type MutableActionItem = Pick<
  ActionItem,
  "id" | "organization_id" | "status" | "type" | "source_type" | "source_id" | "primary_entity_id" | "title" | "assigned_to" | "metadata"
>;

/**
 * Загружает action item для мутации, scope по active organization.
 * RLS дополнительно гарантирует tenant-изоляцию. null → не найден/нет доступа.
 */
export async function loadActionItem(
  supabase: SupabaseClient,
  organizationId: string,
  id: string,
): Promise<MutableActionItem | null> {
  const { data } = await supabase
    .from("action_items")
    .select(MUTATION_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  return (data as MutableActionItem) ?? null;
}
