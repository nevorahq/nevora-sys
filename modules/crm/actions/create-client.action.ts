"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { maskEmail } from "@/lib/email";
import { checkPlanLimit } from "@/lib/billing";
import { createClientSchema } from "../schemas/crm.schemas";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { assertPausedModuleAction } from "@/shared/config/paused-modules";

export async function createClientAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // CRM is paused for the private beta. A "use server" export stays
  // reachable over POST even while its page 404s — gate the mutation itself.
  assertPausedModuleAction("crm");

  const { user, org, workspace } = await requireOrg();

  const limitCheck = await checkPlanLimit(org.id, "clients");
  if (!limitCheck.allowed) {
    return { error: limitCheck.reason ?? "Plan limit reached. Upgrade your plan." };
  }

  const rawData = {
    name:        formData.get("name") as string,
    email:       (formData.get("email") as string) || null,
    phone:       (formData.get("phone") as string) || null,
    website:     (formData.get("website") as string) || null,
    company:     (formData.get("company") as string) || null,
    client_type: (formData.get("client_type") as string) || "company",
    status:      (formData.get("status") as string) || "lead",
    source:      (formData.get("source") as string) || "manual",
    description: (formData.get("description") as string) || null,
    assigned_to: (formData.get("assigned_to") as string) || null,
  };

  const parsed = createClientSchema.safeParse(rawData);
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

    const { data: newClient, error } = await supabase
      .from("crm_clients")
      .insert({
        organization_id: org.id,
        workspace_id:    workspace.id,
        created_by:      user.id,
        updated_by:      user.id,
        ...parsed.data,
      })
      .select("id")
      .single();

    if (error || !newClient) {
      console.error("createClient error:", error);
      return { error: "Failed to create client" };
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        workspaceId:    workspace.id,
        eventName:      "client.created",
        aggregateType:  "client",
        aggregateId:    newClient.id,
        // Raw email lives in the crm_clients row (RLS-scoped); the durable
        // event stream keeps only a masked form, never the raw address.
        payload:        { name: parsed.data.name, email: maskEmail(parsed.data.email) },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "crm_clients",
        entityId:       newClient.id,
        action:         "create",
        newData:        { name: parsed.data.name, status: parsed.data.status },
        metadata:       { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("createClient unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.crm);
  return {};
}
