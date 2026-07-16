import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ResolvedExchangeRate = {
  rate: number;
  source: "same_currency" | "manual" | "bank_api" | "global";
  effectiveDate: string;
  provider: string | null;
  rateKind: "mid" | "buy" | "sell";
  isStale: boolean;
  exchangeRateId: string | null;
};

type ResolverRow = {
  rate: string | number;
  source: ResolvedExchangeRate["source"];
  effective_date: string;
  provider: string | null;
  rate_kind: ResolvedExchangeRate["rateKind"];
  is_stale: boolean;
  exchange_rate_id: string | null;
};

export async function resolveExchangeRate(
  organizationId: string,
  fromCurrency: string,
  toCurrency: string,
  onDate: string,
): Promise<ResolvedExchangeRate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_resolve_organization_exchange_rate", {
    p_organization_id: organizationId,
    p_from_currency: fromCurrency,
    p_to_currency: toCurrency,
    p_on_date: onDate,
  });

  if (error) {
    console.error("resolveExchangeRate error:", error);
    return null;
  }

  const row = ((data as ResolverRow[] | null) ?? [])[0];
  if (!row) return null;

  return {
    rate: Number(row.rate),
    source: row.source,
    effectiveDate: row.effective_date,
    provider: row.provider,
    rateKind: row.rate_kind,
    isStale: row.is_stale,
    exchangeRateId: row.exchange_rate_id,
  };
}
