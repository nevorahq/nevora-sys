"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { isAdmin } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import { getExchangeRateSchema } from "../schemas/exchange-rate.schema";
import { isUnusualRate, toStoredOrganizationRate } from "../utils/rate-convention";
import type { ActionResult } from "@/lib/validators/common";

export async function saveExchangeRateAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { dict } = await getDictionary();
  const labels = dict.money.exchangeRates;
  const schema = getExchangeRateSchema({
    currencyRequired: labels.errors.currencyRequired,
    ratePositive: labels.errors.ratePositive,
    invalidDate: dict.money.errors.invalidDate,
  });
  const parsed = schema.safeParse({
    quote_currency: formData.get("quote_currency"),
    rate: formData.get("rate"),
    effective_date: formData.get("effective_date"),
    confirm_correction: formData.get("confirm_correction") ?? "no",
    confirm_unusual: formData.get("confirm_unusual") ?? "no",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
  } catch (error) {
    return accessErrorToActionResult(error) ?? { error: labels.errors.saveFailed };
  }
  if (!isAdmin(ctx)) return { error: labels.errors.adminOnly };
  if (parsed.data.quote_currency === ctx.org.baseCurrency) {
    return { fieldErrors: { quote_currency: [labels.errors.sameCurrency] } };
  }

  const supabase = await createClient();
  const displayRate = Number(parsed.data.rate);
  const storedRate = toStoredOrganizationRate(parsed.data.rate);
  const { data: referenceData, error: referenceError } = await supabase.rpc(
    "fn_get_exchange_rate",
    {
      p_from: parsed.data.quote_currency,
      p_to: ctx.org.baseCurrency,
      p_on_date: parsed.data.effective_date,
    },
  );
  if (referenceError) {
    console.error("saveExchangeRate reference lookup error:", referenceError);
  }
  const referenceRate = referenceData == null ? null : Number(referenceData);
  if (
    referenceRate != null
    && isUnusualRate(displayRate, referenceRate)
    && parsed.data.confirm_unusual !== "yes"
  ) {
    return { fieldErrors: { rate: [labels.errors.unusualConfirmation] } };
  }

  const { data: existing, error: lookupError } = await supabase
    .from("organization_exchange_rates")
    .select("id, rate, source, provider")
    .eq("organization_id", ctx.org.id)
    .eq("base_currency", ctx.org.baseCurrency)
    .eq("quote_currency", parsed.data.quote_currency)
    .eq("effective_date", parsed.data.effective_date)
    .eq("rate_kind", "mid")
    .maybeSingle();

  if (lookupError) {
    console.error("saveExchangeRate lookup error:", lookupError);
    return { error: labels.errors.saveFailed };
  }

  if (existing) {
    if (existing.source !== "manual") return { error: labels.errors.providerConflict };
    if (parsed.data.confirm_correction !== "yes") {
      return { fieldErrors: { rate: [labels.errors.correctionConfirmation] } };
    }

    const oldRate = Number(existing.rate);
    const { error } = await supabase
      .from("organization_exchange_rates")
      .update({
        rate: storedRate,
        updated_by: ctx.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("organization_id", ctx.org.id);
    if (error) {
      console.error("saveExchangeRate correction error:", error);
      return { error: labels.errors.saveFailed };
    }

    await emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "money.exchange_rate.updated",
      aggregateType: "exchange_rate",
      aggregateId: existing.id,
      payload: {
        base_currency: ctx.org.baseCurrency,
          quote_currency: parsed.data.quote_currency,
          old_rate: oldRate,
          new_rate: Number(storedRate),
        effective_date: parsed.data.effective_date,
        source: "manual",
      },
    });
  } else {
    const { data: created, error } = await supabase
      .from("organization_exchange_rates")
      .insert({
        organization_id: ctx.org.id,
        base_currency: ctx.org.baseCurrency,
        quote_currency: parsed.data.quote_currency,
        rate: storedRate,
        effective_date: parsed.data.effective_date,
        source: "manual",
        rate_kind: "mid",
        provider: null,
        created_by: ctx.user.id,
        updated_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (error || !created) {
      console.error("saveExchangeRate insert error:", error);
      return { error: labels.errors.saveFailed };
    }

    await emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "money.exchange_rate.created",
      aggregateType: "exchange_rate",
      aggregateId: created.id,
      payload: {
          base_currency: ctx.org.baseCurrency,
          quote_currency: parsed.data.quote_currency,
          rate: Number(storedRate),
        effective_date: parsed.data.effective_date,
        source: "manual",
      },
    });
  }

  revalidatePath(ROUTES.money);
  return {};
}
