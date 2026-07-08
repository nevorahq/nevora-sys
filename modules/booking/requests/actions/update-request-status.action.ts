"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { sendBookingStatusEmail } from "@/lib/email";
import { updateBookingRequestStatusSchema } from "../schemas/booking-request.schemas";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { assertPausedModuleAction } from "@/shared/config/paused-modules";

type BookingRequestEmailContext = {
  id: string;
  status: string;
  assigned_to_user_id: string;
  client_name: string;
  client_email: string | null;
  requested_start_at: string;
  client_timezone: string | null;
  booking_host_profiles: { display_name: string } | { display_name: string }[] | null;
  booking_services: { name: string } | { name: string }[] | null;
};

export async function updateBookingRequestStatusAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // BOOKING is paused for the private beta. A "use server" export stays
  // reachable over POST even while its page 404s — gate the mutation itself.
  assertPausedModuleAction("booking");

  const { org, workspace } = await requireOrg();
  const supabase = await createClient();

  const requestId = formData.get("requestId") as string;
  const idParsed = uuidSchema.safeParse(requestId);
  if (!idParsed.success) {
    return { error: "Invalid request ID" };
  }

  const statusParsed = updateBookingRequestStatusSchema.safeParse({
    status: formData.get("status"),
  });
  if (!statusParsed.success) {
    return { error: "Invalid status" };
  }

  // Fetch the request to verify ownership and get current state
  const { data: existingRaw, error: fetchError } = await supabase
    .from("booking_requests")
    .select(
      "id, status, assigned_to_user_id, booking_host_profile_id, client_name, client_email, " +
      "requested_start_at, client_timezone, booking_host_profiles(display_name), booking_services(name)",
    )
    .eq("id", idParsed.data)
    .eq("organization_id", org.id)
    .maybeSingle();

  const existing = existingRaw as unknown as BookingRequestEmailContext | null;
  if (fetchError || !existing) {
    return { error: "Booking request not found" };
  }

  if (existing.status !== "pending") {
    return { error: "Only pending requests can be updated" };
  }

  const { error: updateError } = await supabase
    .from("booking_requests")
    .update({ status: statusParsed.data.status })
    .eq("id", idParsed.data)
    .eq("organization_id", org.id);

  if (updateError) {
    return { error: "Failed to update request" };
  }

  const eventName =
    statusParsed.data.status === "accepted"
      ? "booking.request.accepted"
      : statusParsed.data.status === "rejected"
        ? "booking.request.rejected"
        : "booking.request.canceled";

  const host = Array.isArray(existing.booking_host_profiles)
    ? existing.booking_host_profiles[0]
    : existing.booking_host_profiles;
  const service = Array.isArray(existing.booking_services)
    ? existing.booking_services[0]
    : existing.booking_services;
  const emailDelivery =
    statusParsed.data.status === "accepted" || statusParsed.data.status === "rejected"
      ? await sendBookingStatusEmail({
          to: existing.client_email ?? "",
          clientName: existing.client_name,
          status: statusParsed.data.status,
          serviceName: service?.name ?? "Запись",
          hostName: host?.display_name ?? "Менеджер",
          requestedStartAt: existing.requested_start_at,
          timezone: existing.client_timezone,
        })
      : { status: "not_applicable" as const };

  await Promise.all([
    emitDomainEvent({
      organizationId: org.id,
      workspaceId: workspace.id,
      eventName,
      aggregateType: "booking_request",
      aggregateId: idParsed.data,
      payload: {
        booking_request_id: idParsed.data,
        host_user_id: existing.assigned_to_user_id,
      },
    }),
    emitAuditLog({
      organizationId: org.id,
      entityType: "booking_requests",
      entityId: idParsed.data,
      action: "status_change",
      oldData: { status: existing.status },
      newData: { status: statusParsed.data.status },
      metadata: { source: "dashboard", email_delivery: emailDelivery },
    }),
  ]);

  revalidatePath(ROUTES.bookingRequests);
  return {};
}
