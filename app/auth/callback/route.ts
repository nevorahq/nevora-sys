import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  authUrl,
  onboardingUrl,
  resolveProductEntryRoute,
  ROUTES,
} from "@/shared/config/routes";

/** Завершает Supabase PKCE-подтверждение email и восстанавливает выбранный продукт. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const destination =
    resolveProductEntryRoute(request.nextUrl.searchParams.get("next")) ?? ROUTES.appHome;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(onboardingUrl(destination), request.url));
    }
  }

  const loginUrl = new URL(authUrl(ROUTES.login, destination), request.url);
  loginUrl.searchParams.set("confirmation", "failed");
  return NextResponse.redirect(loginUrl);
}
