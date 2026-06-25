import { createClient } from "@/lib/supabase/server";
import type { Invoice } from "../types/billing.types";

export async function getInvoices(
  organizationId: string,
  limit = 12,
): Promise<Invoice[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id, organization_id, subscription_id, amount, currency, status, " +
      "billing_reason, period_start, period_end, paid_at, " +
      "external_id, pdf_url, metadata, created_at",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getInvoices error:", error);
    return [];
  }
  return (data ?? []) as unknown as Invoice[];
}
