"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { ROUTES, bookingPageUrl } from "@/shared/config/routes";

export async function togglePublicBookingPageAction(
  publicEnabled: boolean,
): Promise<{ error?: string }> {
  const { org, membership } = await requireOrg();
  if (!["owner", "admin"].includes(membership.roleId)) {
    return { error: "Only owners and admins can publish a booking page" };
  }

  const supabase = await createClient();
  const { data: page, error } = await supabase
    .from("booking_pages")
    .update({ public_enabled: publicEnabled })
    .eq("organization_id", org.id)
    .select("id")
    .maybeSingle();

  if (error || !page) {
    console.error("togglePublicBookingPage error:", error);
    return { error: "Booking page is not initialized. Apply the booking migrations first." };
  }

  revalidatePath(ROUTES.booking);
  revalidatePath(bookingPageUrl(org.slug));
  return {};
}
