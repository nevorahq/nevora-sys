"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { emitAuditLog } from "@/lib/events";
import { ROUTES } from "@/shared/config/routes";
import { authorizeSettingsAction } from "../utils/settings-permissions";
import type { SettingsActionState } from "../types/settings.types";

export async function removeAvatar(): Promise<SettingsActionState> {
  const context = await authorizeSettingsAction("profile.update");
  if (!context) return { error: "You do not have access." };

  const supabase = await createClient();
  const storagePath = `${context.user.id}/avatar`;
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", context.user.id);

  if (profileError) return { error: "Avatar could not be removed from your profile." };

  const { error: storageError } = await supabase.storage.from("avatars").remove([storagePath]);
  if (storageError) {
    // The profile no longer references the object. A later cleanup can remove the orphan safely.
    console.error("removeAvatar storage cleanup error:", storageError);
  }

  await emitAuditLog({
    organizationId: context.org.id,
    entityType: "profiles",
    entityId: context.user.id,
    action: "update",
    newData: { fields_changed: ["avatar_url"], avatar_removed: true },
    metadata: { source: "dashboard" },
  });

  revalidatePath(ROUTES.settingsProfile);
  return { success: "Avatar removed." };
}
