import { NextResponse, type NextRequest } from "next/server";
import { changePlanSchema } from "@/modules/billing/schemas/billing.schemas";
import { createCheckoutSessionForCurrentOrganization } from "@/modules/billing/actions/create-checkout-session.action";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = changePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid checkout request.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const result = await createCheckoutSessionForCurrentOrganization(parsed.data);
  if (result.error) {
    const status = result.error.includes("not connected yet") ? 501 : 403;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ url: result.redirectUrl }, { status: 200 });
}
