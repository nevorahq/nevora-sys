import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CrmContact } from "../types/crm.types";

export interface GetContactsOptions {
  clientId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function getContacts(
  orgId: string,
  options: GetContactsOptions = {},
): Promise<CrmContact[]> {
  const supabase = await createClient();

  let query = supabase
    .from("crm_contacts")
    .select(
      "id, organization_id, client_id, first_name, last_name, email, phone, position, is_primary, created_by, created_at, updated_at, deleted_at",
    )
    .eq("organization_id", orgId)
    .is("deleted_at", null);

  if (options.clientId) query = query.eq("client_id", options.clientId);
  if (options.search) {
    query = query.or(
      `first_name.ilike.%${options.search}%,last_name.ilike.%${options.search}%,email.ilike.%${options.search}%`,
    );
  }
  if (options.limit) query = query.limit(options.limit);
  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1);
  }

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) {
    console.error("getContacts error:", error);
    return [];
  }
  return (data ?? []) as CrmContact[];
}
