export type BookingRequestStatus = "pending" | "accepted" | "rejected" | "canceled";

export interface BookingRequest {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  booking_page_id: string;
  booking_host_profile_id: string;
  booking_service_id: string;
  lead_id: string | null;
  assigned_to_user_id: string;
  requested_start_at: string;
  requested_end_at: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  message: string | null;
  status: BookingRequestStatus;
  source_channel: string;
  client_timezone: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/** Представление для внутреннего dashboard (с join данными). */
export interface BookingRequestWithDetails extends BookingRequest {
  host_display_name: string;
  host_slug: string;
  service_name: string;
  service_duration_minutes: number;
}

/** Результат публичного создания запроса. */
export interface CreateBookingRequestResult {
  bookingRequestId: string;
  leadId: string;
}
