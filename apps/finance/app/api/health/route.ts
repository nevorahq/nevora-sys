import { FINANCE_EXTRACTION_STAGE } from "../../../src/boundary";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    { status: "ok", service: "finance", stage: FINANCE_EXTRACTION_STAGE },
    { headers: { "cache-control": "no-store" } },
  );
}
