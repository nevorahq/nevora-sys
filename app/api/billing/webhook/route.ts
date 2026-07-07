import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/observability/logger";
import {
  BillingProviderNotConfiguredError,
  billingProvider,
} from "@/modules/billing/services/billing-provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  try {
    const result = await billingProvider.handleWebhook(rawBody, request.headers);
    if (!result.accepted) {
      logger.warn("billing.webhook.rejected", { reason: result.ignoredReason });
      return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
    }

    logger.info("billing.webhook.processed", {
      eventType: result.eventType,
      duplicate: result.duplicate,
      ignoredReason: result.ignoredReason,
      organizationId: result.organizationId ?? null,
    });
    return NextResponse.json(
      {
        ok: result.ok,
        duplicate: result.duplicate,
        ignoredReason: result.ignoredReason,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof BillingProviderNotConfiguredError) {
      logger.error("billing.webhook.misconfigured", { reason: error.message });
      return NextResponse.json({ error: "Billing webhook is not configured." }, { status: 503 });
    }

    logger.warn("billing.webhook.invalid_payload", {
      error: error instanceof Error ? error.message : "invalid_payload",
    });
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
}
