"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { ROUTES } from "@/shared/config/routes";
import { updateHostSchema } from "../schemas/host.schemas";
import type { ActionResult } from "@/lib/validators/common";

export async function updateHostAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { org } = await requireOrg();
  const supabase = await createClient();

  const parsed = updateHostSchema.safeParse({
    id:           formData.get("id"),
    display_name: formData.get("display_name"),
    host_slug:    formData.get("host_slug"),
    public_title: formData.get("public_title") || undefined,
    timezone:     formData.get("timezone"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase
    .from("booking_host_profiles")
    .update({
      display_name: parsed.data.display_name,
      host_slug:    parsed.data.host_slug,
      public_title: parsed.data.public_title ?? null,
      timezone:     parsed.data.timezone,
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", org.id);

  if (error) {
    if (error.code === "23505") {
      return { fieldErrors: { host_slug: ["This slug is already taken"] } };
    }
    return { error: error.message };
  }

  revalidatePath(ROUTES.bookingHosts);
  return {};
}
