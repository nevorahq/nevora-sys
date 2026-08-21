import {
  readFinanceRuntimeEnvironment,
  FinanceRuntimeConfigurationError,
} from "../../../src/environment";
import { createFinanceServiceRoleClient } from "../../../src/supabase";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let configured = false;
  let databaseConnected = false;
  try {
    const environment = readFinanceRuntimeEnvironment();
    configured = true;
    const supabase = createFinanceServiceRoleClient(environment);
    const { error } = await supabase.from("organizations").select("id").limit(1);
    if (error) {
      console.error("[finance-runtime] readiness database check failed:", error.message);
    }
    databaseConnected = !error;
  } catch (error) {
    if (!(error instanceof FinanceRuntimeConfigurationError)) {
      console.error(
        "[finance-runtime] readiness failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  const ready = configured && databaseConnected;
  return Response.json(
    {
      status: ready ? "ready" : "not_ready",
      service: "finance",
      databaseConfigured: configured,
      databaseConnected,
      serviceIdentityConfigured: configured,
    },
    { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
