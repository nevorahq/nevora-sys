import { TASKS_EXTRACTION_STAGE } from "../../../src/boundary";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    { status: "ok", service: "tasks", stage: TASKS_EXTRACTION_STAGE },
    { headers: { "cache-control": "no-store" } },
  );
}
