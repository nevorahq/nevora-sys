export interface TimeSlot {
  start: string; // ISO 8601 with TZ offset
  end: string;
}

export interface AvailabilityByDate {
  [dateKey: string]: TimeSlot[]; // dateKey: "YYYY-MM-DD"
}

export interface AvailabilityRule {
  day_of_week: number;
  start_time: string; // "HH:MM:SS"
  end_time: string;
}

export interface BlackoutPeriod {
  starts_at: string;
  ends_at: string;
}

export interface ExistingBooking {
  requested_start_at: string;
  requested_end_at: string;
}

export interface ServiceConfig {
  duration_minutes: number;
  slot_interval_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  minimum_notice_minutes: number;
  booking_window_days: number;
}

export interface AvailabilityInput {
  organizationSlug: string;
  hostSlug: string;
  serviceSlug: string;
  startDate: string;  // "YYYY-MM-DD"
  endDate: string;    // "YYYY-MM-DD"
  timeZone: string;
}
