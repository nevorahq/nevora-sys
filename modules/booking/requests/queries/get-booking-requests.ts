import { createClient } from "@/lib/supabase/server";
import type { BookingRequestWithDetails } from "../types/booking-request.types";

export async function getBookingRequests(
  organizationId: string,
  options?: { status?: string; limit?: number },
): Promise<BookingRequestWithDetails[]> {
  const supabase = await createClient();

  let query = supabase
    .from("booking_requests")
    .select(
      `
      id,
      organization_id,
      workspace_id,
      booking_page_id,
      booking_host_profile_id,
      booking_service_id,
      lead_id,
      assigned_to_user_id,
      requested_start_at,
      requested_end_at,
      client_name,
      client_email,
      client_phone,
      message,
      status,
      source_channel,
      client_timezone,
      metadata,
      created_at,
      updated_at,
      booking_host_profiles ( display_name, host_slug ),
      booking_services ( name, duration_minutes )
    `,
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (options?.status) {
    query = query.eq("status", options.status);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error || !data) return [];

  return data.map((row) => {
    const host = Array.isArray(row.booking_host_profiles)
      ? row.booking_host_profiles[0]
      : row.booking_host_profiles;
    const svc = Array.isArray(row.booking_services)
      ? row.booking_services[0]
      : row.booking_services;

    return {
      id: row.id,
      organization_id: row.organization_id,
      workspace_id: row.workspace_id,
      booking_page_id: row.booking_page_id,
      booking_host_profile_id: row.booking_host_profile_id,
      booking_service_id: row.booking_service_id,
      lead_id: row.lead_id,
      assigned_to_user_id: row.assigned_to_user_id,
      requested_start_at: row.requested_start_at,
      requested_end_at: row.requested_end_at,
      client_name: row.client_name,
      client_email: row.client_email,
      client_phone: row.client_phone,
      message: row.message,
      status: row.status as BookingRequestWithDetails["status"],
      source_channel: row.source_channel,
      client_timezone: row.client_timezone,
      metadata: row.metadata,
      created_at: row.created_at,
      updated_at: row.updated_at,
      host_display_name: host?.display_name ?? "—",
      host_slug: host?.host_slug ?? "",
      service_name: svc?.name ?? "—",
      service_duration_minutes: svc?.duration_minutes ?? 0,
    };
  });
}

export async function getBookingRequestsSummary(
  organizationId: string,
): Promise<{ total: number; pending: number; today: number }> {
  const supabase = await createClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [totalRes, pendingRes, todayRes] = await Promise.all([
    supabase
      .from("booking_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("booking_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "pending"),
    supabase
      .from("booking_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", todayStart.toISOString()),
  ]);

  return {
    total: totalRes.count ?? 0,
    pending: pendingRes.count ?? 0,
    today: todayRes.count ?? 0,
  };
}
