import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getPublicHosts } from "@/modules/booking";
import { pausedModuleGuard } from "@/shared/config/paused-modules";

const querySchema = z.object({
  organizationSlug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
});

/** GET /api/public/booking/hosts?organizationSlug=acme */
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

  const hosts = await getPublicHosts(parsed.data.organizationSlug);

  return NextResponse.json({ hosts });
}
