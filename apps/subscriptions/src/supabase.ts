import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SubscriptionsRuntimeEnvironment } from "./environment";

export function createSubscriptionsServiceRoleClient(
  environment: SubscriptionsRuntimeEnvironment,
): SupabaseClient {
  return createClient(
    environment.supabaseUrl,
    environment.supabaseServiceRoleKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { "x-nevora-service": "subscriptions" },
        fetch: (input, init) => fetch(input, {
          ...init,
          signal: AbortSignal.timeout(10_000),
        }),
      },
    },
  );
}
