"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";
import { assertPausedModuleAction } from "@/shared/config/paused-modules";

export async function deleteClientAction(clientId: string): Promise<{ error?: string }> {
  // CRM is paused for the private beta. A "use server" export stays
  // reachable over POST even while its page 404s — gate the mutation itself.
  assertPausedModuleAction("crm");

  const { user, org } = await requireOrg();

  const parsed = uuidSchema.safeParse(clientId);
  if (!parsed.success) return { error: "Invalid client ID" };

  try {
    const supabase = await createClient();

    const { data: client } = await supabase
      .from("crm_clients")
      .select("id, name")
      .eq("id", parsed.data)
      .eq("organization_id", org.id)
      .single();

    if (!client) return { error: "Client not found" };

    const { error } = await supabase
      .from("crm_clients")
      .update({ deleted_at: new Date().toISOString(), updated_by: user.id })
      .eq("id", parsed.data)
      .eq("organization_id", org.id);

    if (error) {
      console.error("deleteClient error:", error);
      return { error: "Failed to delete client" };
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        eventName:      "client.deleted",
        aggregateType:  "client",
        aggregateId:    client.id,
        payload:        { name: client.name },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "crm_clients",
        entityId:       client.id,
        action:         "delete",
        oldData:        { name: client.name },
        metadata:       { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("deleteClient unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.crm);
  return {};
}
