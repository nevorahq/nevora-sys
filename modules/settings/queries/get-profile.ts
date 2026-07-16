import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireSettingsPermission } from "../utils/settings-permissions";
import type { ProfileSettings } from "../types/settings.types";

export async function getProfile(): Promise<ProfileSettings> {
  const { user } = await requireSettingsPermission("profile.read");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, phone, language, timezone")
    .eq("id", user.id)
    .single();

  if (error) throw new Error(`Unable to load profile: ${error.message}`);

  const avatarPath = (data.avatar_url as string | null) ?? null;
  let avatarUrl: string | null = avatarPath;
  if (avatarPath && !avatarPath.startsWith("http://") && !avatarPath.startsWith("https://")) {
    const { data: signedAvatar, error: signedAvatarError } = await supabase.storage
      .from("avatars")
      .createSignedUrl(avatarPath, 60 * 60);
    avatarUrl = signedAvatarError ? null : signedAvatar.signedUrl;
  }

  return {
    id: user.id,
    fullName: (data.display_name as string | null) ?? "",
    email: user.email ?? "",
    avatarUrl,
    phone: (data.phone as string | null) ?? "",
    language: ["en", "ru", "ro"].includes(data.language as string) ? (data.language as "en" | "ru" | "ro") : "en",
    timezone: (data.timezone as string | null) ?? "UTC",
  };
}
