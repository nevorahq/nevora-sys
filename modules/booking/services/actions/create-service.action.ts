"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { ROUTES } from "@/shared/config/routes";
import { createServiceSchema } from "../schemas/service.schemas";
import type { ActionResult } from "@/lib/validators/common";

export async function createServiceAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { org } = await requireOrg();
  const supabase = await createClient();

  const parsed = createServiceSchema.safeParse({
    name:                formData.get("name"),
    slug:                formData.get("slug"),
    description:         formData.get("description") || undefined,
    duration_minutes:    formData.get("duration_minutes"),
    booking_window_days: formData.get("booking_window_days"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Look up the org's booking page
  const { data: page } = await supabase
    .from("booking_pages")
    .select("id")
    .eq("organization_id", org.id)
    .single();

  if (!page) {
    return { error: "Booking page not found. Contact support." };
  }

  const { data: service, error } = await supabase
    .from("booking_services")
    .insert({
      organization_id:     org.id,
      booking_page_id:     page.id,
      name:                parsed.data.name,
      slug:                parsed.data.slug,
      description:         parsed.data.description ?? null,
      duration_minutes:    parsed.data.duration_minutes,
      slot_interval_minutes:  30,
      buffer_before_minutes:  0,
      buffer_after_minutes:   0,
      minimum_notice_minutes: 60,
      booking_window_days:    parsed.data.booking_window_days,
      requires_manual_confirmation: true,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { fieldErrors: { slug: ["This slug is already taken"] } };
    }
    return { error: error.message };
  }

  // Auto-assign to all active hosts in the org
  const { data: hosts } = await supabase
    .from("booking_host_profiles")
    .select("id")
    .eq("organization_id", org.id)
    .eq("is_active", true);

  if (hosts && hosts.length > 0 && service) {
    const assignments = hosts.map((h) => ({
      organization_id:         org.id,
      booking_host_profile_id: h.id,
      booking_service_id:      service.id,
      is_active:               true,
    }));
    await supabase
      .from("booking_host_services")
      .upsert(assignments, { onConflict: "booking_host_profile_id,booking_service_id" });
  }

  revalidatePath(ROUTES.bookingServices);
  return {};
}
