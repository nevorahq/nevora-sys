"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitAuditLog } from "@/lib/events";
import { createContactSchema } from "../schemas/crm.schemas";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { assertPausedModuleAction } from "@/shared/config/paused-modules";

export async function createContactAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // CRM is paused for the private beta. A "use server" export stays
  // reachable over POST even while its page 404s — gate the mutation itself.
  assertPausedModuleAction("crm");

  const { user, org } = await requireOrg();

  const rawData = {
    client_id:  (formData.get("client_id") as string) || null,
    first_name: formData.get("first_name") as string,
    last_name:  (formData.get("last_name") as string) || null,
    email:      (formData.get("email") as string) || null,
    phone:      (formData.get("phone") as string) || null,
    position:   (formData.get("position") as string) || null,
    is_primary: formData.get("is_primary") === "true",
  };

  const parsed = createContactSchema.safeParse(rawData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  try {
    const supabase = await createClient();

    // If client_id provided, verify it belongs to org
    if (parsed.data.client_id) {
      const { data: clientCheck } = await supabase
        .from("crm_clients")
        .select("id")
        .eq("id", parsed.data.client_id)
        .eq("organization_id", org.id)
        .single();

      if (!clientCheck) return { error: "Client not found" };
    }

    const { data: newContact, error } = await supabase
      .from("crm_contacts")
      .insert({
        organization_id: org.id,
        created_by:      user.id,
        ...parsed.data,
      })
      .select("id")
      .single();

    if (error || !newContact) {
      console.error("createContact error:", error);
      return { error: "Failed to create contact" };
    }

    await emitAuditLog({
      organizationId: org.id,
      entityType:     "crm_contacts",
      entityId:       newContact.id,
      action:         "create",
      newData:        { first_name: parsed.data.first_name, client_id: parsed.data.client_id },
      metadata:       { source: "dashboard" },
    });
  } catch (err) {
    console.error("createContact unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.crm);
  return {};
}
