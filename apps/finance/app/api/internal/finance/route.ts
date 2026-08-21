import { handleFinanceRequest } from "../../../../src/request-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleFinanceRequest(request);
}
