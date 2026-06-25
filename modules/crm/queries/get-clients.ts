import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CrmClient, CrmClientWithContacts } from "../types/crm.types";
import type { ClientStatus } from "../constants/crm.constants";

export interface GetClientsOptions {
  status?: ClientStatus;
  assignedTo?: string;
  unassigned?: boolean;
  limit?: number;
  offset?: number;
  search?: string;
}

export async function getClients(
  orgId: string,
  options: GetClientsOptions = {},
): Promise<CrmClient[]> {
  const supabase = await createClient();

  let query = supabase
    .from("crm_clients")
    .select("id, organization_id, workspace_id, name, email, phone, website, company, client_type, status, source, description, assigned_to, created_by, updated_by, created_at, updated_at, deleted_at")
    .eq("organization_id", orgId);

  if (options.status) query = query.eq("status", options.status);
  if (options.unassigned) {
    query = query.is("assigned_to", null);
  } else if (options.assignedTo) {
    query = query.eq("assigned_to", options.assignedTo);
  }
  if (options.search) query = query.ilike("name", `%${options.search}%`);
  if (options.limit) query = query.limit(options.limit);
  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1);
  }

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error("getClients error:", error);
    return [];
  }

  return (data ?? []) as CrmClient[];
}

export async function getClientById(
  orgId: string,
  clientId: string,
): Promise<CrmClientWithContacts | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("crm_clients")
    .select(`
      id, organization_id, workspace_id, name, email, phone, website, company,
      client_type, status, source, description, assigned_to,
      created_by, updated_by, created_at, updated_at, deleted_at,
      crm_contacts (
        id, organization_id, client_id, first_name, last_name,
        email, phone, position, is_primary, created_by, created_at, updated_at, deleted_at
      )
    `)
    .eq("id", clientId)
    .eq("organization_id", orgId)
    .single();

  if (error || !data) return null;

  return {
    ...data,
    crm_contacts: undefined,
    contacts: (Array.isArray(data.crm_contacts) ? data.crm_contacts : [])
      .filter((c) => !c.deleted_at),
  } as CrmClientWithContacts;
}
