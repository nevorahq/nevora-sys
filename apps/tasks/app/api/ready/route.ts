import {
  readTasksRuntimeEnvironment,
  TasksRuntimeConfigurationError,
} from "../../../src/environment";
import { createTasksServiceRoleClient } from "../../../src/supabase";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let configured = false;
  let databaseConnected = false;
  try {
    const environment = readTasksRuntimeEnvironment();
    configured = true;
    const supabase = createTasksServiceRoleClient(environment);
    const { error } = await supabase.from("organizations").select("id").limit(1);
    if (error) {
      console.error("[tasks-runtime] readiness database check failed:", error.message);
    }
    databaseConnected = !error;
  } catch (error) {
    if (!(error instanceof TasksRuntimeConfigurationError)) {
      console.error(
        "[tasks-runtime] readiness failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  const ready = configured && databaseConnected;
  return Response.json(
    {
      status: ready ? "ready" : "not_ready",
      service: "tasks",
      databaseConfigured: configured,
      databaseConnected,
      serviceIdentityConfigured: configured,
    },
    { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
