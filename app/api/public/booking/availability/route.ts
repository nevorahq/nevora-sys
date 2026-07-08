import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveAvailability, type AvailabilityDataSource } from "@/modules/booking";
import { getClientIp } from "@/lib/http/client-ip";
import { checkRateLimit, tooManyRequestsResponse } from "@/lib/rate-limit/rate-limit";
import { pausedModuleGuard } from "@/shared/config/paused-modules";

const querySchema = z.object({
  organizationSlug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  hostSlug:         z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  serviceSlug:      z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  start:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "start must be YYYY-MM-DD"),
  end:              z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "end must be YYYY-MM-DD"),
  timeZone:         z.string().min(1).max(100).default("UTC"),
});

/**
 * GET /api/public/booking/availability
 *   ?organizationSlug=acme&hostSlug=ion-popescu&serviceSlug=consultation
 *   &start=2026-06-12&end=2026-06-30&timeZone=Europe/Chisinau
 *
 * Returns Cal.com-style slot groups keyed by local date.
 *
 * Доступные слоты строятся ИСКЛЮЧИТЕЛЬНО из активных правил
 * booking_availability_rules выбранного host. Если у host нет активного
 * расписания — слоты не предлагаются (никакого fallback-графика).
 */
export async function GET(request: NextRequest) {
  // Booking is paused for the private beta: the route handler must 404 too,
  // otherwise the module stays reachable as a public API even with no UI.
  const paused = pausedModuleGuard("booking");
  if (paused) return paused;

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  const { organizationSlug, hostSlug, serviceSlug, start, end, timeZone } = parsed.data;

  // Rate limit (мягкий — это публичный read-эндпоинт, но защищаем от перебора).
  const rl = await checkRateLimit({
    bucket: "booking:availability",
    ip: getClientIp(request),
    scope: organizationSlug,
  });
  if (!rl.allowed) {
    return tooManyRequestsResponse(rl.retryAfterSeconds);
  }

  const supabase = await createClient();

  // Supabase-backed источник данных. Резолв host/service строго по slug'ам
  // (никаких internal ID от клиента); брони фильтруются по ПЕРЕСЕЧЕНИЮ
  // интервалов, а не по containment.
  const source: AvailabilityDataSource = {
    async getHostService() {
      const { data: hostData } = await supabase
        .from("booking_host_profiles")
        .select(
          `
          id,
          timezone,
          booking_pages!inner ( public_enabled, organization_slug ),
          booking_host_services!inner (
            is_active,
            booking_services!inner (
              slug,
              duration_minutes,
              slot_interval_minutes,
              buffer_before_minutes,
              buffer_after_minutes,
              minimum_notice_minutes,
              booking_window_days,
              is_active
            )
          )
        `,
        )
        .eq("host_slug", hostSlug)
        .eq("is_active", true)
        .eq("booking_pages.public_enabled", true)
        .eq("booking_pages.organization_slug", organizationSlug)
        .eq("booking_host_services.is_active", true)
        .eq("booking_host_services.booking_services.slug", serviceSlug)
        .eq("booking_host_services.booking_services.is_active", true)
        .maybeSingle();

      if (!hostData) return null;

      const hostServices = Array.isArray(hostData.booking_host_services)
        ? hostData.booking_host_services
        : [hostData.booking_host_services];
      const serviceLink = hostServices[0];
      const svc = Array.isArray(serviceLink?.booking_services)
        ? serviceLink.booking_services[0]
        : serviceLink?.booking_services;

      if (!svc) return null;

      return {
        hostId: hostData.id as string,
        service: {
          duration_minutes:       svc.duration_minutes,
          slot_interval_minutes:  svc.slot_interval_minutes,
          buffer_before_minutes:  svc.buffer_before_minutes,
          buffer_after_minutes:   svc.buffer_after_minutes,
          minimum_notice_minutes: svc.minimum_notice_minutes,
          booking_window_days:    svc.booking_window_days,
        },
      };
    },

    async getActiveRules(hostId) {
      const { data } = await supabase
        .from("booking_availability_rules")
        .select("day_of_week, start_time, end_time")
        .eq("booking_host_profile_id", hostId)
        .eq("is_active", true)
        .order("day_of_week", { ascending: true });
      return data ?? [];
    },

    async getConflictingBookings(hostId, rangeStart, rangeEnd) {
      // Interval overlap: booking.start < rangeEnd И booking.end > rangeStart.
      // Так попадают брони, начавшиеся ДО `start` или закончившиеся ПОСЛЕ `end`.
      const { data } = await supabase
        .from("booking_requests")
        .select("requested_start_at, requested_end_at")
        .eq("booking_host_profile_id", hostId)
        .in("status", ["pending", "accepted"])
        .lt("requested_start_at", rangeEnd.toISOString())
        .gt("requested_end_at", rangeStart.toISOString());
      return data ?? [];
    },

    async getBlackouts(hostId, rangeStart, rangeEnd) {
      // Overlap: blackout.ends_at >= rangeStart И blackout.starts_at <= rangeEnd.
      const { data } = await supabase
        .from("booking_blackout_dates")
        .select("starts_at, ends_at")
        .eq("booking_host_profile_id", hostId)
        .gte("ends_at", rangeStart.toISOString())
        .lte("starts_at", rangeEnd.toISOString());
      return data ?? [];
    },
  };

  const availability = await resolveAvailability(source, {
    organizationSlug,
    hostSlug,
    serviceSlug,
    start,
    end,
    timeZone,
  });

  return NextResponse.json({ data: availability });
}
