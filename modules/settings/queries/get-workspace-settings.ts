import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireSettingsPermission } from "../utils/settings-permissions";
import type { BusinessType, WorkspaceSettings } from "../types/settings.types";

export async function getWorkspaceSettings(): Promise<WorkspaceSettings> {
  const context = await requireSettingsPermission("workspace.read");
  const supabase = await createClient();
  const [{ data: organization, error: organizationError }, { data: workspace, error: workspaceError }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("id, name, logo_url, business_type, base_currency, default_language, timezone")
        .eq("id", context.org.id)
        .single(),
      supabase
        .from("workspaces")
        .select("id, name")
        .eq("id", context.workspace.id)
        .eq("organization_id", context.org.id)
        .single(),
    ]);

  if (organizationError || workspaceError || !organization || !workspace) {
    throw new Error("Unable to load workspace settings");
  }

  return {
    organizationId: context.org.id,
    workspaceId: context.workspace.id,
    organizationName: organization.name as string,
    workspaceName: workspace.name as string,
    logoUrl: (organization.logo_url as string | null) ?? null,
    businessType: ((organization.business_type as BusinessType | null) ?? "other"),
    defaultCurrency: (organization.base_currency as string | null) ?? "EUR",
    defaultLanguage: organization.default_language === "ru" ? "ru" : "en",
    timezone: (organization.timezone as string | null) ?? "UTC",
  };
}
