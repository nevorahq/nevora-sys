import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getPublicHostServices } from "@/modules/booking";

const querySchema = z.object({
  organizationSlug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  hostSlug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
});

/** GET /api/public/booking/services?organizationSlug=acme&hostSlug=ion-popescu */
export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  const services = await getPublicHostServices(
    parsed.data.organizationSlug,
    parsed.data.hostSlug,
  );

  return NextResponse.json({ services });
}
