"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function deleteHostAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
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
