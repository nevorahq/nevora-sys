import { NextResponse, type NextRequest } from "next/server";
import { createBookingRequestSchema } from "@/modules/booking";
import { createBookingRequest } from "@/modules/booking";
import { getClientIp } from "@/lib/http/client-ip";
import { checkRateLimit, tooManyRequestsResponse } from "@/lib/rate-limit/rate-limit";
import { pausedModuleGuard } from "@/shared/config/paused-modules";

/**
 * POST /api/public/booking/requests
 *
 * Принимает публичный запрос на бронирование.
 *
 * Security:
 *   - Rate limit по IP (+ organization slug) — защита от спама записями
 *   - Zod валидация входных данных
 *   - Honeypot поле (bot защита)
 *   - Никакие internal IDs не принимаются от клиента
 *   - Вся бизнес-логика в SECURITY DEFINER RPC
 *   - Сервер резолвит organization_id / user_id / host_id из slugs
 */
export async function POST(request: NextRequest) {
  // Booking is paused for the private beta: the route handler must 404 too,
  // otherwise the module stays reachable as a public API even with no UI.
  const paused = pausedModuleGuard("booking");
  if (paused) return paused;

  const ip = getClientIp(request);

  // Грубый IP-лимит до парсинга тела — защита от шквала записей.
  const ipLimit = await checkRateLimit({
    bucket: "booking:requests:ip",
    ip,
  });
  if (!ipLimit.allowed) {
    return tooManyRequestsResponse(ipLimit.retryAfterSeconds);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createBookingRequestSchema.safeParse(body);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return NextResponse.json(
      { error: "validation_failed", fieldErrors },
      { status: 422 },
    );
  }

  // Более строгий лимит в разрезе IP + конкретная организация.
  const orgLimit = await checkRateLimit({
    bucket: "booking:requests:org",
    ip,
    scope: parsed.data.organizationSlug,
  });
  if (!orgLimit.allowed) {
    return tooManyRequestsResponse(orgLimit.retryAfterSeconds);
  }

  // Honeypot check — если поле заполнено, это бот
  if (parsed.data.honeypot) {
    // Возвращаем 200 чтобы бот не знал что был задетектирован
    return NextResponse.json({ bookingRequestId: null });
  }

  const result = await createBookingRequest(parsed.data);

  if (!result.success) {
    const statusMap: Record<string, number> = {
      booking_page_not_found:         404,
      host_not_found:                 404,
      service_not_found:              404,
      service_not_offered_by_host:    422,
      slot_too_soon:                  409,
      slot_out_of_window:             409,
      slot_not_available:             409,
      slot_conflict_client:           409,
      client_name_required:           422,
      contact_method_required:        422,
    };
    const status = statusMap[result.error] ?? 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(result.data, { status: 201 });
}
