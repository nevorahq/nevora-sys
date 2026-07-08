import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { pausedModuleGuard } from "@/shared/config/paused-modules";

export async function GET(req: NextRequest) {
  // Booking is paused for the private beta: the route handler must 404 too,
  // otherwise the module stays reachable as a public API even with no UI.
  const paused = pausedModuleGuard("booking");
  if (paused) return paused;

  try {
    const { org } = await requireOrg();
    const hostId = req.nextUrl.searchParams.get("hostId");

    if (!hostId) {
      return NextResponse.json({ error: "hostId required" }, { status: 400 });
    }

    const supabase = await createClient();

    // Verify host belongs to org
    const { data: host } = await supabase
      .from("booking_host_profiles")
      .select("id")
      .eq("id", hostId)
      .eq("organization_id", org.id)
      .single();

    if (!host) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: rules } = await supabase
      .from("booking_availability_rules")
      .select("day_of_week, start_time, end_time")
      .eq("booking_host_profile_id", hostId)
      .eq("is_active", true)
      .order("day_of_week", { ascending: true });

    return NextResponse.json({ rules: rules ?? [] });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
