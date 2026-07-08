import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { pausedModuleGuard } from "@/shared/config/paused-modules";

const querySchema = z.object({
  organizationSlug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
});

/** GET /api/public/booking/page?organizationSlug=acme */
export async function GET(request: NextRequest) {
  // Booking is paused for the private beta: the route handler must 404 too,
  // otherwise the module stays reachable as a public API even with no UI.
  const paused = pausedModuleGuard("booking");
  if (paused) return paused;

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("booking_pages")
    .select("title, description, slug, default_timezone, organization_slug")
    .eq("organization_slug", parsed.data.organizationSlug)
    .eq("public_enabled", true)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    bookingPage: {
      title: data.title,
      description: data.description ?? null,
      slug: data.slug,
      defaultTimezone: data.default_timezone,
    },
  });
}
