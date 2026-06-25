import { createClient } from "@/lib/supabase/server";
import type { PublicBookingService } from "../types/booking-service.types";

/**
 * Загружает услуги, предлагаемые хостом, для публичной страницы.
 * Фильтрует через booking_host_services — только услуги, назначенные этому хосту.
 */
export async function getPublicHostServices(
  organizationSlug: string,
  hostSlug: string,
): Promise<PublicBookingService[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("booking_host_services")
    .select(
      `
      booking_services!inner (
        slug,
        name,
        description,
        duration_minutes,
        is_active
      ),
      booking_host_profiles!inner (
        host_slug,
        is_active,
        booking_pages!inner ( public_enabled, organization_slug )
      )
    `,
    )
    .eq("is_active", true)
    .eq("booking_services.is_active", true)
    .eq("booking_host_profiles.host_slug", hostSlug)
    .eq("booking_host_profiles.is_active", true)
    .eq("booking_host_profiles.booking_pages.public_enabled", true)
    .eq("booking_host_profiles.booking_pages.organization_slug", organizationSlug);

  if (error || !data) return [];

  return data
    .map((row) => {
      const svc = Array.isArray(row.booking_services)
        ? row.booking_services[0]
        : row.booking_services;
      if (!svc) return null;
      return {
        slug: svc.slug,
        name: svc.name,
        description: svc.description ?? null,
        durationMinutes: svc.duration_minutes,
      };
    })
    .filter((s): s is PublicBookingService => s !== null);
}
