import { NextResponse, type NextRequest } from "next/server";
import {
  assertApiRateLimit,
  authenticateApiKeyRequest,
  forbiddenApiResponse,
  rateLimitedApiResponse,
  trackApiUsage,
  unauthorizedApiResponse,
} from "@/lib/api/developer-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authenticateApiKeyRequest(request);
  if (!auth) return unauthorizedApiResponse();
  if (auth.rejectionReason) return forbiddenApiResponse(auth.rejectionReason);

  try {
    await assertApiRateLimit(auth);
    await trackApiUsage(auth);
  } catch {
    return rateLimitedApiResponse();
  }

  return NextResponse.json(
    {
      organization: {
        id: auth.organizationId,
        name: auth.organizationName,
        slug: auth.organizationSlug,
      },
      plan: {
        code: auth.planCode,
      },
      apiKey: {
        id: auth.apiKeyId,
        scopes: auth.scopes,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
