"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export interface DayRule {
  day_of_week: number; // 0=Sun..6=Sat
  start_time: string;  // "HH:MM"
  end_time: string;    // "HH:MM"
  enabled: boolean;
}

export async function saveAvailabilityAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { org } = await requireOrg();
  const supabase = await createClient();

  const hostProfileId = formData.get("host_profile_id") as string | null;
  const rulesJson = formData.get("rules") as string | null;

  if (!hostProfileId || !rulesJson) {
    return { error: "Missing required data." };
  }

  let rules: DayRule[];
  try {
    rules = JSON.parse(rulesJson);
  } catch {
    return { error: "Invalid rules format." };
  }

  // Verify this host belongs to the org
  const { data: host } = await supabase
    .from("booking_host_profiles")
    .select("id")
    .eq("id", hostProfileId)
    .eq("organization_id", org.id)
    .single();

  if (!host) return { error: "Host not found." };

  // Replace all rules: delete existing, insert enabled ones
  await supabase
    .from("booking_availability_rules")
    .delete()
    .eq("booking_host_profile_id", hostProfileId);

  const activeRules = rules.filter(
    (r) => r.enabled && r.start_time && r.end_time && r.start_time < r.end_time,
  );

  if (activeRules.length > 0) {
    const { error } = await supabase.from("booking_availability_rules").insert(
      activeRules.map((r) => ({
        organization_id:        org.id,
        booking_host_profile_id: hostProfileId,
        day_of_week:            r.day_of_week,
        start_time:             r.start_time + ":00",
        end_time:               r.end_time + ":00",
        is_active:              true,
      })),
    );
    if (error) return { error: error.message };
  }

  revalidatePath(ROUTES.bookingAvailability);
  return {};
}
