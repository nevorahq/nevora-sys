"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { ROUTES } from "@/shared/config/routes";
import { updateServiceSchema } from "../schemas/service.schemas";
import type { ActionResult } from "@/lib/validators/common";

export async function updateServiceAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { org } = await requireOrg();
  const supabase = await createClient();

  const parsed = updateServiceSchema.safeParse({
    id:                  formData.get("id"),
    name:                formData.get("name"),
    slug:                formData.get("slug"),
    description:         formData.get("description") || undefined,
    duration_minutes:    formData.get("duration_minutes"),
    booking_window_days: formData.get("booking_window_days"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { error } = await supabase
    .from("booking_services")
    .update({
      name:                parsed.data.name,
      slug:                parsed.data.slug,
      description:         parsed.data.description ?? null,
      duration_minutes:    parsed.data.duration_minutes,
      booking_window_days: parsed.data.booking_window_days,
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", org.id);

  if (error) {
    if (error.code === "23505") {
      return { fieldErrors: { slug: ["This slug is already taken"] } };
    }
    return { error: error.message };
  }

  revalidatePath(ROUTES.bookingServices);
  return {};
}
