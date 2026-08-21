import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FinanceRuntimeEnvironment } from "./environment";

export function createFinanceServiceRoleClient(
  environment: FinanceRuntimeEnvironment,
): SupabaseClient {
  return createClient(
    environment.supabaseUrl,
    environment.supabaseServiceRoleKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { "x-nevora-service": "finance" },
        fetch: (input, init) => fetch(input, {
          ...init,
          signal: AbortSignal.timeout(10_000),
        }),
      },
    },
  );
}
