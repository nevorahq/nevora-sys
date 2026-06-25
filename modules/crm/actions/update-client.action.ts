"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitAuditLog } from "@/lib/events";
import { updateClientSchema } from "../schemas/crm.schemas";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function updateClientAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, org } = await requireOrg();

  const clientId = formData.get("clientId") as string;
  const idParsed = uuidSchema.safeParse(clientId);
  if (!idParsed.success) return { error: "Invalid client ID" };

  const rawData = Object.fromEntries(
    [...formData.entries()]
      .filter(([k]) => k !== "clientId")
      .map(([k, v]) => [k, v === "" ? null : v]),
  );

  const parsed = updateClientSchema.safeParse(rawData);
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

    const { error } = await supabase
      .from("crm_clients")
      .update({ ...parsed.data, updated_by: user.id })
      .eq("id", idParsed.data)
      .eq("organization_id", org.id);

    if (error) {
      console.error("updateClient error:", error);
      return { error: "Failed to update client" };
    }

    await emitAuditLog({
      organizationId: org.id,
      entityType:     "crm_clients",
      entityId:       idParsed.data,
      action:         "update",
      newData:        parsed.data as Record<string, unknown>,
      metadata:       { source: "dashboard" },
    });
  } catch (err) {
    console.error("updateClient unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.crm);
  return {};
}
