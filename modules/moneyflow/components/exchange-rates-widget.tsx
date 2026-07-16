"use client";

import { useActionState, useRef, useState } from "react";
import { BadgeCheckIcon, CircleAlertIcon, HistoryIcon } from "lucide-react";
import { saveExchangeRateAction } from "../actions/save-exchange-rate.action";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import { useAccessGate } from "@/modules/billing/components/access-state";
import {
  isUnusualRate,
  normalizeLocalizedRate,
  relativeRateDeviation,
} from "../utils/rate-convention";
import type { ExchangeRateOverview } from "../queries/get-exchange-rates";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface ExchangeRatesWidgetProps {
  overview: ExchangeRateOverview;
  canManage: boolean;
  dict: Dictionary;
}

function formatRate(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 10, useGrouping: false });
}

export function ExchangeRatesWidget({ overview, canManage, dict }: ExchangeRatesWidgetProps) {
  const t = dict.money.exchangeRates;
  const { blocked, message } = useAccessGate("write");
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedCurrency, setSelectedCurrency] = useState("");
  const [rateValue, setRateValue] = useState("");
  const selectedRate = overview.currencies.find(({ currency }) => currency === selectedCurrency);
  const numericRate = Number(normalizeLocalizedRate(rateValue));
  const referenceRate = selectedRate?.referenceBaseRate ?? null;
  const deviation = referenceRate == null
    ? null
    : relativeRateDeviation(numericRate, referenceRate);
  const unusual = referenceRate != null && isUnusualRate(numericRate, referenceRate);
  const inverseRate = Number.isFinite(numericRate) && numericRate > 0 ? 1 / numericRate : null;
  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (previous, formData) => {
      const result = await saveExchangeRateAction(previous, formData);
      if (!result.error && !result.fieldErrors) {
        formRef.current?.reset();
        setSelectedCurrency("");
        setRateValue("");
      }
      return result;
    },
    {},
  );
  const today = new Date().toISOString().slice(0, 10);
  const currencyOptions = overview.currencies.map(({ currency }) => ({
    value: currency,
    label: currency,
  }));

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            {t.title}
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            {t.baseCurrency}: <span className="font-medium text-text-primary">{overview.baseCurrency}</span>
          </p>
        </div>
        {!canManage && <span className="text-xs text-text-muted">{t.readOnly}</span>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="soft-card p-4 sm:p-5">
          {overview.currencies.length === 0 ? (
            <p className="text-sm text-text-muted">{t.noForeignCurrencies}</p>
          ) : (
            <div className="space-y-3">
              {overview.currencies.map(({ currency, current, baseRate, referenceBaseRate }) => {
                const currentUnusual = baseRate != null
                  && referenceBaseRate != null
                  && isUnusualRate(baseRate, referenceBaseRate);
                return (
                <div key={currency} className="flex flex-wrap items-center justify-between gap-3 rounded-(--neu-radius-md) bg-surface-sunken px-4 py-3">
                  <div>
                    <p className="font-medium tabular-nums text-text-primary">
                      {current && baseRate != null
                        ? `1 ${currency} = ${formatRate(baseRate)} ${overview.baseCurrency}`
                        : `1 ${currency} = — ${overview.baseCurrency}`}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {current
                        ? `${t.sources[current.source]} · ${current.effectiveDate}`
                        : t.missing}
                    </p>
                    {referenceBaseRate != null && (
                      <p className="mt-1 text-xs tabular-nums text-text-muted">
                        {t.referenceRate}: 1 {currency} = {formatRate(referenceBaseRate)} {overview.baseCurrency}
                      </p>
                    )}
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                    !current || current.isStale || currentUnusual
                      ? "bg-accent-yellow-soft text-text-primary"
                      : "bg-accent-green-soft text-accent-green"
                  }`}>
                    {!current || current.isStale || currentUnusual ? <CircleAlertIcon size={13} /> : <BadgeCheckIcon size={13} />}
                    {!current
                      ? t.statusMissing
                      : currentUnusual
                        ? t.statusUnusual
                        : current.isStale ? t.statusStale : t.statusCurrent}
                  </span>
                </div>
                );
              })}
            </div>
          )}

          <details className="mt-4 border-t border-border-soft pt-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-text-secondary">
              <HistoryIcon size={15} /> {t.history}
            </summary>
            {overview.history.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">{t.noHistory}</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-text-muted">
                    <tr>
                      <th className="pb-2 pr-3 font-medium">{t.pair}</th>
                      <th className="pb-2 pr-3 font-medium">{t.rate}</th>
                      <th className="pb-2 pr-3 font-medium">{t.date}</th>
                      <th className="pb-2 pr-3 font-medium">{t.source}</th>
                      <th className="pb-2 font-medium">{t.changedBy}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.history.map((row) => (
                      <tr key={row.id} className="border-t border-border-soft text-text-primary">
                        <td className="py-2.5 pr-3">{row.quoteCurrency}/{row.baseCurrency}</td>
                        <td className="py-2.5 pr-3 tabular-nums">{formatRate(row.rate)}</td>
                        <td className="py-2.5 pr-3">{row.effectiveDate}</td>
                        <td className="py-2.5 pr-3">{t.sources[row.source]}</td>
                        <td className="py-2.5">{row.changedBy ?? row.provider ?? t.system}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </details>
        </div>

        {canManage && currencyOptions.length > 0 && (
          <form ref={formRef} action={formAction} className="soft-card-sm space-y-3 p-4">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{t.addTitle}</h3>
              <p className="mt-1 text-xs leading-5 text-text-muted">{t.addHint}</p>
            </div>
            {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
            {blocked && <p role="alert" className="text-sm text-text-muted">{message}</p>}
            <Select
              id="exchange-rate-currency"
              name="quote_currency"
              label={t.currency}
              options={[{ value: "", label: t.selectCurrency }, ...currencyOptions]}
              value={selectedCurrency}
              onChange={(event) => {
                setSelectedCurrency(event.target.value);
                setRateValue("");
              }}
              required
              disabled={blocked}
              error={state.fieldErrors?.quote_currency?.[0]}
            />
            <Input
              id="exchange-rate-value"
              name="rate"
              type="text"
              inputMode="decimal"
              label={selectedCurrency
                ? `1 ${selectedCurrency} = … ${overview.baseCurrency}`
                : t.rate}
              placeholder={t.ratePlaceholder}
              value={rateValue}
              onChange={(event) => setRateValue(event.target.value)}
              required
              disabled={blocked}
              error={state.fieldErrors?.rate?.[0]}
            />
            {selectedCurrency && (
              <div className="rounded-(--neu-radius-md) bg-surface-sunken px-3 py-2.5 text-xs text-text-muted">
                <p>{t.rateConvention.replace("{quote}", selectedCurrency).replace("{base}", overview.baseCurrency)}</p>
                {inverseRate != null && (
                  <p className="mt-1 tabular-nums">
                    {t.inverseRate}: 1 {overview.baseCurrency} = {formatRate(inverseRate)} {selectedCurrency}
                  </p>
                )}
                {referenceRate != null && (
                  <p className="mt-1 tabular-nums">
                    {t.referenceRate}: 1 {selectedCurrency} = {formatRate(referenceRate)} {overview.baseCurrency}
                  </p>
                )}
              </div>
            )}
            {unusual && (
              <div className="rounded-(--neu-radius-md) border border-accent-yellow/30 bg-accent-yellow-soft px-3 py-2.5 text-xs text-text-primary">
                <p>
                  {t.unusualRateWarning} {deviation != null ? `${(deviation * 100).toFixed(1)}%.` : ""}
                </p>
                <label className="mt-2 flex items-start gap-2">
                  <input type="checkbox" name="confirm_unusual" value="yes" className="mt-0.5" />
                  <span>{t.confirmUnusual}</span>
                </label>
              </div>
            )}
            <Input
              id="exchange-rate-date"
              name="effective_date"
              type="date"
              label={t.date}
              defaultValue={today}
              required
              disabled={blocked}
              error={state.fieldErrors?.effective_date?.[0]}
            />
            <label className="flex items-start gap-2 text-xs leading-5 text-text-muted">
              <input type="checkbox" name="confirm_correction" value="yes" disabled={blocked} className="mt-1" />
              <span>{t.correctionConfirmation}</span>
            </label>
            <Button type="submit" isLoading={isPending} disabled={blocked} className="w-full">
              {isPending ? dict.common.loading : t.save}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
