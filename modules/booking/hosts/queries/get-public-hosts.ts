import { createClient } from "@/lib/supabase/server";
import type { PublicHostProfile } from "../types/booking-host.types";

/**
 * Загружает публичные профили хостов для страницы бронирования.
 * Использует anon-safe RLS: только активные хосты публично включённых страниц.
 * Возвращает только публично-безопасные поля.
 */
export async function getPublicHosts(
  organizationSlug: string,
): Promise<PublicHostProfile[]> {
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
      sort_order,
      booking_pages!inner ( public_enabled, organization_slug )
    `,
    )
    .eq("is_active", true)
    .eq("booking_pages.public_enabled", true)
    .eq("booking_pages.organization_slug", organizationSlug)
    .order("sort_order", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    slug: row.host_slug,
    displayName: row.display_name,
    publicTitle: row.public_title ?? null,
    publicBio: row.public_bio ?? null,
    avatarUrl: row.avatar_url ?? null,
  }));
}
