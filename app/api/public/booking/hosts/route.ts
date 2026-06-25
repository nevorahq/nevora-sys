import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getPublicHosts } from "@/modules/booking";

const querySchema = z.object({
  organizationSlug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
});

/** GET /api/public/booking/hosts?organizationSlug=acme */
export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  const hosts = await getPublicHosts(parsed.data.organizationSlug);

  return NextResponse.json({ hosts });
}
