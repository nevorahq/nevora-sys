"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { emitAuditLog } from "@/lib/events";
import { ROUTES } from "@/shared/config/routes";
import { profileSchema } from "../schemas/profile.schema";
import { authorizeSettingsAction } from "../utils/settings-permissions";
import { zodActionError } from "../utils/action-errors";
import type { SettingsActionState } from "../types/settings.types";

export async function updateProfile(
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const context = await authorizeSettingsAction("profile.update");
  if (!context) return { error: "You do not have access." };

  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    language: formData.get("language"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) return zodActionError(parsed.error);

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: parsed.data.fullName,
        phone: parsed.data.phone || null,
        language: parsed.data.language,
        timezone: parsed.data.timezone,
      })
      .eq("id", context.user.id);

    if (error) return { error: "Profile changes could not be saved." };

    await emitAuditLog({
      organizationId: context.org.id,
      entityType: "profiles",
      entityId: context.user.id,
      action: "update",
      newData: {
        fields_changed: ["display_name", "phone", "language", "timezone"],
        email_changed: false,
      },
      metadata: { source: "dashboard" },
    });
    revalidatePath(ROUTES.settingsProfile);
    return { success: "Profile saved." };
  } catch (error) {
    console.error("updateProfile error:", error);
    return { error: "Profile changes could not be saved." };
  }
}
