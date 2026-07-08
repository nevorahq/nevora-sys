"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { ROUTES } from "@/shared/config/routes";
import { createHostSchema } from "../schemas/host.schemas";
import type { ActionResult } from "@/lib/validators/common";
import { assertPausedModuleAction } from "@/shared/config/paused-modules";

export async function createHostAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // BOOKING is paused for the private beta. A "use server" export stays
  // reachable over POST even while its page 404s — gate the mutation itself.
  assertPausedModuleAction("booking");

  const { org, membership } = await requireOrg();
  const supabase = await createClient();

  const parsed = createHostSchema.safeParse({
    display_name: formData.get("display_name"),
    host_slug:    formData.get("host_slug"),
    public_title: formData.get("public_title") || undefined,
    timezone:     formData.get("timezone"),
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

  const { data: host, error } = await supabase
    .from("booking_host_profiles")
    .insert({
      organization_id:  org.id,
      booking_page_id:  page.id,
      user_id:          membership.userId,
      membership_id:    membership.id,
      host_slug:        parsed.data.host_slug,
      display_name:     parsed.data.display_name,
      public_title:     parsed.data.public_title ?? null,
      timezone:         parsed.data.timezone,
      is_active:        true,
      sort_order:       0,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { fieldErrors: { host_slug: ["This slug is already taken"] } };
    }
    return { error: error.message };
  }

  // Auto-assign all active services in the org to the new host
  if (host) {
    const { data: services } = await supabase
      .from("booking_services")
      .select("id")
      .eq("organization_id", org.id)
      .eq("is_active", true);

    if (services && services.length > 0) {
      const assignments = services.map((s) => ({
        organization_id:         org.id,
        booking_host_profile_id: host.id,
        booking_service_id:      s.id,
        is_active:               true,
      }));
      await supabase
        .from("booking_host_services")
        .upsert(assignments, { onConflict: "booking_host_profile_id,booking_service_id" });
    }
  }

  revalidatePath(ROUTES.bookingHosts);
  return {};
}
