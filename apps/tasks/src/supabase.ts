import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TasksRuntimeEnvironment } from "./environment";

export function createTasksServiceRoleClient(
  environment: TasksRuntimeEnvironment,
): SupabaseClient {
  return createClient(
    environment.supabaseUrl,
    environment.supabaseServiceRoleKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { "x-nevora-service": "tasks" },
        fetch: (input, init) => fetch(input, {
          ...init,
          signal: AbortSignal.timeout(10_000),
        }),
      },
    },
  );
}
