"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { assertPausedModuleAction } from "@/shared/config/paused-modules";

export async function deleteHostAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // BOOKING is paused for the private beta. A "use server" export stays
  // reachable over POST even while its page 404s — gate the mutation itself.
  assertPausedModuleAction("booking");

  const { org } = await requireOrg();
  const supabase = await createClient();

  const id = formData.get("id") as string | null;
  if (!id) return { error: "Missing host id" };

  const { error } = await supabase
    .from("booking_host_profiles")
    .delete()
    .eq("id", id)
    .eq("organization_id", org.id);

  if (error) return { error: error.message };

  revalidatePath(ROUTES.bookingHosts);
  return {};
}
