import { createClient } from "@/lib/supabase/server";
import type { PublicHostProfile } from "../types/booking-host.types";

export async function getPublicHostBySlug(
  organizationSlug: string,
  hostSlug: string,
): Promise<PublicHostProfile | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("booking_host_profiles")
    .select(
      `
      host_slug,
      display_name,
      public_title,
      public_bio,
      avatar_url,
      booking_pages!inner ( public_enabled, organization_slug )
    `,
    )
    .eq("host_slug", hostSlug)
    .eq("is_active", true)
    .eq("booking_pages.public_enabled", true)
    .eq("booking_pages.organization_slug", organizationSlug)
    .maybeSingle();

  if (error || !data) return null;

  return {
    slug: data.host_slug,
    displayName: data.display_name,
    publicTitle: data.public_title ?? null,
    publicBio: data.public_bio ?? null,
    avatarUrl: data.avatar_url ?? null,
  };
}
