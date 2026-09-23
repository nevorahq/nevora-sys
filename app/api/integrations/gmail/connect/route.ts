import { NextResponse } from "next/server";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validators/common";
import { buildGoogleAuthorizationUrl } from "@/modules/integrations/gmail/gmail-api";
import { GmailConfigurationError } from "@/modules/integrations/gmail/gmail-config";

export const runtime = "nodejs";

const STATE_COOKIE = "nevora_gmail_oauth_state";

export async function GET(request: Request) {
  try {
    const subscriptionId = uuidSchema.safeParse(new URL(request.url).searchParams.get("subscriptionId"));
    if (!subscriptionId.success) {
      return NextResponse.json({ error: "A valid subscription is required." }, { status: 400 });
    }

    const ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
    const supabase = await createClient();
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("id", subscriptionId.data)
      .eq("organization_id", ctx.org.id)
      .maybeSingle();
    if (!subscription) return NextResponse.json({ error: "Subscription not found." }, { status: 404 });

    const state = crypto.randomUUID();
    const cookiePayload = Buffer.from(JSON.stringify({ state, subscriptionId: subscriptionId.data }), "utf8").toString("base64url");
    const response = NextResponse.redirect(buildGoogleAuthorizationUrl(state));
    response.cookies.set(STATE_COOKIE, cookiePayload, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/integrations/gmail/callback",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    if (isAccessError(error)) return NextResponse.json({ error: error.message }, { status: error.httpStatus });
    const message = error instanceof GmailConfigurationError
      ? error.message
      : "Gmail authorization could not be started.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
