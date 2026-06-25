import { createClient } from "@/lib/supabase/server";

/**
 * Серверная проверка доступности слота перед финальным созданием booking_request.
 *
 * Вызывается из API route /api/public/booking/requests перед RPC.
 * Даёт ранний ответ без полного вызова SECURITY DEFINER функции.
 *
 * Конечная валидация всё равно происходит внутри create_booking_request_public() RPC.
 * Это дополнительный барьер, а не единственная защита.
 */
export async function validateBookingSlot(params: {
  organizationSlug: string;
  hostSlug: string;
  serviceSlug: string;
  startAt: Date;
}): Promise<{ valid: boolean; reason?: string }> {
  const { organizationSlug, hostSlug, serviceSlug, startAt } = params;
  const supabase = await createClient();

  // Проверяем что страница + хост + услуга существуют и активны
  const { data: hostData } = await supabase
    .from("booking_host_profiles")
    .select(
      `
      id,
      user_id,
      timezone,
      booking_pages!inner ( public_enabled, organization_slug ),
      booking_host_services!inner (
        is_active,
        booking_services!inner ( slug, minimum_notice_minutes, booking_window_days, duration_minutes )
      )
    `,
    )
    .eq("host_slug", hostSlug)
    .eq("is_active", true)
    .eq("booking_pages.public_enabled", true)
    .eq("booking_pages.organization_slug", organizationSlug)
    .eq("booking_host_services.is_active", true)
    .eq("booking_host_services.booking_services.slug", serviceSlug)
    .maybeSingle();

  if (!hostData) {
    return { valid: false, reason: "host_or_service_not_found" };
  }

  const services = Array.isArray(hostData.booking_host_services)
    ? hostData.booking_host_services
    : [hostData.booking_host_services];

  const serviceLink = services[0];
  const svc = Array.isArray(serviceLink?.booking_services)
    ? serviceLink.booking_services[0]
    : serviceLink?.booking_services;

  if (!svc) {
    return { valid: false, reason: "service_not_found" };
  }

  const now = new Date();
  const minNoticeAt = new Date(now.getTime() + svc.minimum_notice_minutes * 60_000);
  const maxWindowAt = new Date(now.getTime() + svc.booking_window_days * 24 * 60 * 60_000);

  if (startAt < minNoticeAt) {
    return { valid: false, reason: "slot_too_soon" };
  }

  if (startAt > maxWindowAt) {
    return { valid: false, reason: "slot_out_of_window" };
  }

  return { valid: true };
}
