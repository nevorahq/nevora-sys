import { NextResponse } from "next/server";
import { createBillingPortalSession } from "@/modules/settings/actions/create-billing-portal-session";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  const result = await createBillingPortalSession();
  if (result.error) {
    const status = result.error.includes("not connected yet") ? 501 : 403;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ url: result.portalUrl }, { status: 200 });
}
