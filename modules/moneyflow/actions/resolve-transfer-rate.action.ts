"use server";

import { z } from "zod";
import { requireOrg } from "@/lib/auth/require-org";
import { createClient } from "@/lib/supabase/server";
import { resolveExchangeRate, type ResolvedExchangeRate } from "../queries/resolve-exchange-rate";

export type TransferRateResult = {
  fromCurrency?: string;
  toCurrency?: string;
  baseCurrency?: string;
  sourceBaseRate?: number | null;
  destinationBaseRate?: number | null;
  resolved?: ResolvedExchangeRate | null;
  error?: string;
};

const inputSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  onDate: z.string().date(),
});

export async function resolveTransferRateAction(
  fromAccountId: string,
  toAccountId: string,
  onDate: string,
): Promise<TransferRateResult> {
  const parsed = inputSchema.safeParse({ fromAccountId, toAccountId, onDate });
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await requireOrg();
  const supabase = await createClient();
  const { data: accounts, error } = await supabase
    .from("money_accounts")
    .select("id, currency, is_active")
    .eq("organization_id", ctx.org.id)
    .is("deleted_at", null)
    .in("id", [parsed.data.fromAccountId, parsed.data.toAccountId]);
  if (error) return { error: "lookup_failed" };

  const from = accounts?.find((account) => account.id === parsed.data.fromAccountId);
  const to = accounts?.find((account) => account.id === parsed.data.toAccountId);
  if (!from?.is_active || !to?.is_active) return { error: "account_unavailable" };

  const baseCurrency = ctx.org.baseCurrency;
  const [resolved, sourceLeg, destinationLeg] = await Promise.all([
    resolveExchangeRate(ctx.org.id, from.currency, to.currency, parsed.data.onDate),
    from.currency === baseCurrency
      ? Promise.resolve(null)
      : resolveExchangeRate(ctx.org.id, baseCurrency, from.currency, parsed.data.onDate),
    to.currency === baseCurrency
      ? Promise.resolve(null)
      : resolveExchangeRate(ctx.org.id, baseCurrency, to.currency, parsed.data.onDate),
  ]);

  return {
    fromCurrency: from.currency,
    toCurrency: to.currency,
    baseCurrency,
    sourceBaseRate: from.currency === baseCurrency
      ? 1
      : sourceLeg && sourceLeg.rate > 0 ? 1 / sourceLeg.rate : null,
    destinationBaseRate: to.currency === baseCurrency
      ? 1
      : destinationLeg && destinationLeg.rate > 0 ? 1 / destinationLeg.rate : null,
    resolved,
  };
}
