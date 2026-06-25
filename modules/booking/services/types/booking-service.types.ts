export interface BookingService {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  booking_page_id: string;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  slot_interval_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  minimum_notice_minutes: number;
  booking_window_days: number;
  requires_manual_confirmation: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Публично-безопасное представление услуги. */
export interface PublicBookingService {
  slug: string;
  name: string;
  description: string | null;
  durationMinutes: number;
}
