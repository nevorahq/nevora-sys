"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { emitAuditLog } from "@/lib/events";
import { ROUTES } from "@/shared/config/routes";
import { avatarSchema, hasValidAvatarSignature } from "../schemas/avatar.schema";
import { authorizeSettingsAction } from "../utils/settings-permissions";
import type { SettingsActionState } from "../types/settings.types";

const AVATAR_BUCKET = "avatars";

export async function updateAvatar(
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const context = await authorizeSettingsAction("profile.update");
  if (!context) return { error: "You do not have access." };

  const parsed = avatarSchema.safeParse(formData.get("avatar"));
  if (!parsed.success) {
    return { fieldErrors: { avatar: parsed.error.issues.map((issue) => issue.message) } };
  }
  if (!(await hasValidAvatarSignature(parsed.data))) {
    return { fieldErrors: { avatar: ["The file contents do not match its image type."] } };
  }

  const storagePath = `${context.user.id}/avatar`;
  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(storagePath, parsed.data, {
      cacheControl: "3600",
      contentType: parsed.data.type,
      upsert: true,
    });

  if (uploadError) {
    console.error("updateAvatar upload error:", uploadError);
    return { error: "Avatar could not be uploaded." };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_url: storagePath })
    .eq("id", context.user.id);

  if (profileError) {
    console.error("updateAvatar profile error:", profileError);
    return { error: "Avatar was uploaded but could not be attached to your profile." };
  }

  await emitAuditLog({
    organizationId: context.org.id,
    entityType: "profiles",
    entityId: context.user.id,
    action: "update",
    newData: { fields_changed: ["avatar_url"] },
    metadata: { source: "dashboard" },
  });

  revalidatePath(ROUTES.settingsProfile);
  return { success: "Avatar updated." };
}
