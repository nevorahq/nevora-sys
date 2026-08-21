import {
  readSubscriptionsRuntimeEnvironment,
  SubscriptionsRuntimeConfigurationError,
} from "../../../src/environment";
import { createSubscriptionsServiceRoleClient } from "../../../src/supabase";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let configured = false;
  let databaseConnected = false;
  try {
    const environment = readSubscriptionsRuntimeEnvironment();
    configured = true;
    const supabase = createSubscriptionsServiceRoleClient(environment);
    const { error } = await supabase.from("organizations").select("id").limit(1);
    if (error) {
      console.error("[subscriptions-runtime] readiness database check failed:", error.message);
    }
    databaseConnected = !error;
  } catch (error) {
    if (!(error instanceof SubscriptionsRuntimeConfigurationError)) {
      console.error(
        "[subscriptions-runtime] readiness failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  const ready = configured && databaseConnected;
  return Response.json(
    {
      status: ready ? "ready" : "not_ready",
      service: "subscriptions",
      databaseConfigured: configured,
      databaseConnected,
      serviceIdentityConfigured: configured,
    },
    { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
