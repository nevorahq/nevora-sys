import { createClient } from "@/lib/supabase/server";
import type { CreateBookingRequestResult } from "../types/booking-request.types";
import type { CreateBookingRequestInput } from "../schemas/booking-request.schemas";

/**
 * Создаёт booking request через SECURITY DEFINER RPC.
 *
 * RPC create_booking_request_public() атомарно:
 *   1. Резолвит organization/host/service по slug
 *   2. Проверяет доступность слота
 *   3. Создаёт booking_request
 *   4. Создаёт CRM lead (crm_clients)
 *   5. Линкует booking_request.lead_id
 *   6. Создаёт domain events
 *
 * Никогда не принимает internal IDs от клиента.
 */
export async function createBookingRequest(
  input: CreateBookingRequestInput,
): Promise<{ success: true; data: CreateBookingRequestResult } | { success: false; error: string }> {
  const supabase = await createClient();

  const normalizedEmail =
    input.client.email && input.client.email.length > 0
      ? input.client.email
      : undefined;

  const normalizedPhone =
    input.client.phone && input.client.phone.length > 0
      ? input.client.phone
      : undefined;

  const { data, error } = await supabase.rpc("create_booking_request_public", {
    p_organization_slug: input.organizationSlug,
    p_host_slug:         input.hostSlug,
    p_service_slug:      input.serviceSlug,
    p_start_at:          input.start,
    p_client_name:       input.client.name,
    p_client_email:      normalizedEmail ?? null,
    p_client_phone:      normalizedPhone ?? null,
    p_client_timezone:   input.clientTimezone ?? null,
    p_message:           input.client.message ?? null,
  });

  if (error) {
    console.error("[createBookingRequest] RPC error:", error.message);
    return { success: false, error: "server_error" };
  }

  const result = data as { error?: string; bookingRequestId?: string; leadId?: string };

  if (result.error) {
    return { success: false, error: result.error };
  }

  if (!result.bookingRequestId || !result.leadId) {
    return { success: false, error: "unexpected_response" };
  }

  return {
    success: true,
    data: {
      bookingRequestId: result.bookingRequestId,
      leadId: result.leadId,
    },
  };
}
