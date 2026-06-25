import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/http/client-ip";
import { checkRateLimit, tooManyRequestsResponse } from "@/lib/rate-limit/rate-limit";

/**
 * GET /api/public/booking/client-check
 *
 * Проверяет, есть ли у клиента уже подтверждённое или ожидающее
 * бронирование, которое пересекается с запрошенным временным слотом
 * в данной организации (по любому специалисту).
 *
 * Query params:
 *   org      — organization slug (required)
 *   startAt  — ISO 8601 (required)
 *   endAt    — ISO 8601 (required)
 *   email    — optional
 *   phone    — optional (at least one of email/phone required)
 *
 * Returns: { conflict: boolean }
 *
 * Security: эндпоинт — потенциальный oracle перебора (есть ли запись у
 * email/phone), поэтому держим жёсткий rate limit по IP (+ org slug).
 * PII (email/phone) никогда не логируется и не попадает в ключ лимита.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const org = searchParams.get("org")?.trim();
  const startAt = searchParams.get("startAt")?.trim();
  const endAt = searchParams.get("endAt")?.trim();
  const email = searchParams.get("email")?.trim() || null;
  const phone = searchParams.get("phone")?.trim() || null;

  if (!org || !startAt || !endAt) {
    return NextResponse.json({ conflict: false });
  }
  if (!email && !phone) {
    return NextResponse.json({ conflict: false });
  }

  // Жёсткий лимит против перебора: ключ — IP + org slug (без PII).
  const rl = await checkRateLimit({
    bucket: "booking:client-check",
    ip: getClientIp(request),
    scope: org,
  });
  if (!rl.allowed) {
    return tooManyRequestsResponse(rl.retryAfterSeconds);
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "check_client_booking_conflict_public",
    {
      p_organization_slug: org,
      p_client_email: email,
      p_client_phone: phone,
      p_start_at: startAt,
      p_end_at: endAt,
    },
  );

  if (error) {
    return NextResponse.json({ conflict: false });
  }

  return NextResponse.json({ conflict: (data as { conflict: boolean }).conflict ?? false });
}
