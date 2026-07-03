import { NextResponse } from "next/server";
import { logger } from "@/lib/observability/logger";
import { processDueReminders } from "@/modules/notifications/reminders/process-reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await processDueReminders();
  logger.info("cron.reminders", { ...result });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
