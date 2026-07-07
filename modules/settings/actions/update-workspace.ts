"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { ROUTES } from "@/shared/config/routes";
import { workspaceSchema } from "../schemas/workspace.schema";
import { authorizeSettingsAction } from "../utils/settings-permissions";
import { zodActionError } from "../utils/action-errors";
import type { SettingsActionState } from "../types/settings.types";

export async function updateWorkspace(
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const context = await authorizeSettingsAction("workspace.update");
  if (!context) return { error: "Only owners and admins can update workspace settings." };

  // Permission + tenant already enforced above; the gate adds the billing
  // entitlement — settings stay reachable in degraded states but are blocked
  // under suspension / security hold (intent "admin").
  try {
    await requireAppAccess({ intent: "admin" });
  } catch (err) {
    if (isAccessError(err)) return { error: err.message };
    throw err;
  }

  const parsed = workspaceSchema.safeParse({
    organizationName: formData.get("organizationName"),
    workspaceName: formData.get("workspaceName"),
    businessType: formData.get("businessType"),
    defaultCurrency: formData.get("defaultCurrency"),
    defaultLanguage: formData.get("defaultLanguage"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) return zodActionError(parsed.error);

  try {
    const supabase = await createClient();
    const previous = {
      organizationName: context.org.name,
      workspaceName: context.workspace.name,
      defaultCurrency: context.org.baseCurrency,
    };

    const [{ error: organizationError }, { error: workspaceError }] = await Promise.all([
      supabase
        .from("organizations")
        .update({
          name: parsed.data.organizationName,
          business_type: parsed.data.businessType,
          base_currency: parsed.data.defaultCurrency,
          default_language: parsed.data.defaultLanguage,
          timezone: parsed.data.timezone,
        })
        .eq("id", context.org.id),
      supabase
        .from("workspaces")
        .update({ name: parsed.data.workspaceName })
        .eq("id", context.workspace.id)
        .eq("organization_id", context.org.id),
    ]);

    if (organizationError || workspaceError) {
      console.error("updateWorkspace database error:", organizationError ?? workspaceError);
      return { error: "Workspace changes could not be saved." };
    }

    await Promise.all([
      emitAuditLog({
        organizationId: context.org.id,
        entityType: "organizations",
        entityId: context.org.id,
        action: "update",
        oldData: previous,
        newData: parsed.data,
        metadata: { source: "dashboard" },
      }),
      emitDomainEvent({
        organizationId: context.org.id,
        workspaceId: context.workspace.id,
        eventName: "org.updated",
        aggregateType: "organization",
        aggregateId: context.org.id,
        payload: { settings: parsed.data },
      }),
    ]);

    revalidatePath(ROUTES.settingsWorkspace);
    return { success: "Workspace settings saved." };
  } catch (error) {
    console.error("updateWorkspace error:", error);
    return { error: "Workspace changes could not be saved." };
  }
}
