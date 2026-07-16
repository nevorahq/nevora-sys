import "server-only";

import { createClient } from "@/lib/supabase/server";
import { resolveExchangeRate, type ResolvedExchangeRate } from "./resolve-exchange-rate";
import { toDisplayOrganizationRate } from "../utils/rate-convention";

export type OrganizationExchangeRateHistory = {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  effectiveDate: string;
  source: "manual" | "bank_api";
  provider: string | null;
  changedBy: string | null;
  updatedAt: string;
};

export type ExchangeRateOverview = {
  baseCurrency: string;
  currencies: Array<{
    currency: string;
    current: ResolvedExchangeRate | null;
    baseRate: number | null;
    referenceBaseRate: number | null;
  }>;
  history: OrganizationExchangeRateHistory[];
};

type HistoryRow = {
  id: string;
  base_currency: string;
  quote_currency: string;
  rate: string | number;
  effective_date: string;
  source: "manual" | "bank_api";
  provider: string | null;
  updated_at: string;
  updated_by: string | null;
};

export async function getExchangeRateOverview(
  organizationId: string,
  baseCurrency: string,
): Promise<ExchangeRateOverview> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [accountsResult, historyResult] = await Promise.all([
    supabase
      .from("money_accounts")
      .select("currency")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .is("deleted_at", null),
    supabase
      .from("organization_exchange_rates")
      .select("id, base_currency, quote_currency, rate, effective_date, source, provider, updated_at, updated_by")
      .eq("organization_id", organizationId)
      .eq("rate_kind", "mid")
      .order("effective_date", { ascending: false })
      .order("updated_at", { ascending: false }),
  ]);

  if (accountsResult.error) console.error("getExchangeRateOverview accounts error:", accountsResult.error);
  if (historyResult.error) console.error("getExchangeRateOverview history error:", historyResult.error);

  const activeCurrencies = [...new Set(
    (accountsResult.data ?? []).map((account) => account.currency.toUpperCase()),
  )].sort();
  const quoteCurrencies = activeCurrencies.filter((currency) => currency !== baseCurrency);

  const currencies = await Promise.all(
    quoteCurrencies.map(async (currency) => {
      const [current, referenceResult] = await Promise.all([
        resolveExchangeRate(organizationId, baseCurrency, currency, today),
        supabase.rpc("fn_get_exchange_rate", {
          p_from: currency,
          p_to: baseCurrency,
          p_on_date: today,
        }),
      ]);
      if (referenceResult.error) {
        console.error("getExchangeRateOverview reference error:", referenceResult.error);
      }
      const referenceBaseRate = referenceResult.data == null
        ? null
        : Number(referenceResult.data);
      return {
        currency,
        current,
        baseRate: current ? toDisplayOrganizationRate(current.rate) : null,
        referenceBaseRate,
      };
    }),
  );

  const historyRows = (historyResult.data as HistoryRow[] | null) ?? [];
  const actorIds = [...new Set(historyRows.flatMap((row) => row.updated_by ? [row.updated_by] : []))];
  const actors = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", actorIds);
    if (profilesError) console.error("getExchangeRateOverview profiles error:", profilesError);
    for (const profile of profiles ?? []) {
      if (profile.display_name) actors.set(profile.id, profile.display_name);
    }
  }

  const history = historyRows.map((row) => ({
      id: row.id,
      baseCurrency: row.base_currency,
      quoteCurrency: row.quote_currency,
    rate: toDisplayOrganizationRate(row.rate),
      effectiveDate: row.effective_date,
      source: row.source,
      provider: row.provider,
      changedBy: row.updated_by ? actors.get(row.updated_by) ?? null : null,
      updatedAt: row.updated_at,
    }));

  return { baseCurrency, currencies, history };
}
