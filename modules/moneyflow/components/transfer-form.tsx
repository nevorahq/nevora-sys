"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createTransferAction } from "../actions/create-transfer.action";
import { resolveTransferRateAction, type TransferRateResult } from "../actions/resolve-transfer-rate.action";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import { formatMoney } from "@/shared/utils/format-money";
import type { AccountWithBalance } from "../queries/get-accounts-with-balances";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface TransferFormProps {
  fromAccount: AccountWithBalance;
  accounts: AccountWithBalance[];
  dict: Dictionary;
  onSuccess?: () => void;
}

function formatRate(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 10, useGrouping: false });
}

export function TransferForm({ fromAccount, accounts, dict, onSuccess }: TransferFormProps) {
  const t = dict.money.transfer;
  const formRef = useRef<HTMLFormElement>(null);
  const today = new Date().toISOString().split("T")[0];
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [destinationAmount, setDestinationAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(today);
  const [rateResult, setRateResult] = useState<TransferRateResult | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [useCustomDestination, setUseCustomDestination] = useState(false);

  const toOptions = useMemo(
    () => accounts
      .filter((account) => account.id !== fromAccount.id && account.is_active)
      .map((account) => ({
        value: account.id,
        label: `${account.name} · ${account.currency}`,
      })),
    [accounts, fromAccount.id],
  );
  const toAccount = accounts.find((account) => account.id === toAccountId);
  const isCrossCurrency = Boolean(toAccount && toAccount.currency !== fromAccount.currency);

  useEffect(() => {
    if (!toAccountId || !transactionDate) return;
    let active = true;
    resolveTransferRateAction(fromAccount.id, toAccountId, transactionDate)
      .then((result) => {
        if (active) setRateResult(result);
      })
      .catch(() => {
        if (active) setRateResult({ error: "lookup_failed" });
      })
      .finally(() => {
        if (active) setRateLoading(false);
      });
    return () => { active = false; };
  }, [fromAccount.id, toAccountId, transactionDate]);

  const referenceRate = rateResult?.resolved?.rate ?? null;
  const suggestedDestinationAmount = isCrossCurrency && referenceRate && Number(amount) > 0
    ? (Number(amount) * referenceRate).toFixed(2)
    : "";
  const displayedDestinationAmount = useCustomDestination
    ? destinationAmount
    : suggestedDestinationAmount;

  const effectiveRate = Number(amount) > 0 && Number(displayedDestinationAmount) > 0
    ? Number(displayedDestinationAmount) / Number(amount)
    : null;

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prevState, formData) => {
      const result = await createTransferAction(prevState, formData);
      if (!result.error && !result.fieldErrors) {
        formRef.current?.reset();
        setToAccountId("");
        setAmount("");
        setDestinationAmount("");
        setUseCustomDestination(false);
        setRateResult(null);
        onSuccess?.();
      }
      return result;
    },
    {},
  );

  const hasDestination = toOptions.length > 0;
  const crossCurrencyReady = !isCrossCurrency
    || (referenceRate != null && !useCustomDestination)
    || (useCustomDestination && Number(destinationAmount) > 0);

  return (
    <form ref={formRef} action={formAction}>
      {state.error && (
        <div className="mb-3 rounded-(--neu-radius-md) border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          {state.error}
        </div>
      )}

      {!hasDestination && (
        <div className="mb-3 rounded-(--neu-radius-md) border border-info/20 bg-info-soft px-4 py-3 text-sm text-info">
          {t.noDestination}
        </div>
      )}

      <input type="hidden" name="from_account_id" value={fromAccount.id} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">{t.fromLabel}</span>
          <div className="soft-control flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="font-medium text-text-primary">{fromAccount.name} · {fromAccount.currency}</span>
            <span className="tabular-nums text-text-muted">
              {formatMoney(fromAccount.balance)} {fromAccount.currency}
            </span>
          </div>
        </div>

        <Select
          id="transfer-to"
          name="to_account_id"
          label={t.toLabel}
          options={[{ value: "", label: t.selectDestination }, ...toOptions]}
          value={toAccountId}
          onChange={(event) => {
            setToAccountId(event.target.value);
            setRateResult(null);
            setRateLoading(Boolean(event.target.value));
            setUseCustomDestination(false);
            setDestinationAmount("");
          }}
          required
          disabled={!hasDestination}
          className="h-11 py-0"
          error={state.fieldErrors?.to_account_id?.[0]}
        />

        <Input
          id="transfer-amount"
          name="amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          label={`${isCrossCurrency ? t.debitLabel : t.amountLabel} (${fromAccount.currency})`}
          placeholder={t.amountPlaceholder}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
          disabled={!hasDestination}
          className="h-11 py-0"
          error={state.fieldErrors?.amount?.[0]}
        />

        <Input
          id="transfer-date"
          name="transaction_date"
          type="date"
          label={t.dateLabel}
          value={transactionDate}
          onChange={(event) => {
            setTransactionDate(event.target.value);
            setRateResult(null);
            setRateLoading(Boolean(toAccountId && event.target.value));
            setUseCustomDestination(false);
            setDestinationAmount("");
          }}
          disabled={!hasDestination}
          className="h-11 py-0"
          error={state.fieldErrors?.transaction_date?.[0]}
        />

        {isCrossCurrency && toAccount && (
          <div className="rounded-(--neu-radius-md) border border-border-soft bg-surface-sunken p-4 text-sm">
            <dl className="space-y-2">
              <div className="flex justify-between gap-3">
                <dt className="text-text-muted">{t.debitLabel}</dt>
                <dd className="font-medium tabular-nums text-text-primary">
                  {amount ? `${formatMoney(Number(amount))} ${fromAccount.currency}` : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-muted">{t.organizationRate}</dt>
                <dd className="text-right font-medium tabular-nums text-text-primary">
                  {rateLoading
                    ? dict.common.loading
                    : referenceRate
                      ? `1 ${fromAccount.currency} = ${formatRate(referenceRate)} ${toAccount.currency}`
                      : t.rateMissing}
                  </dd>
              </div>
              {rateResult?.baseCurrency
                && rateResult.sourceBaseRate
                && rateResult.destinationBaseRate
                && (
                  <div className="rounded-(--neu-radius-sm) bg-surface px-3 py-2.5 text-xs">
                    <p className="font-medium text-text-secondary">{t.rateBasis}</p>
                    <p className="mt-1 tabular-nums text-text-muted">
                      1 {fromAccount.currency} = {formatRate(rateResult.sourceBaseRate)} {rateResult.baseCurrency}
                    </p>
                    <p className="tabular-nums text-text-muted">
                      1 {toAccount.currency} = {formatRate(rateResult.destinationBaseRate)} {rateResult.baseCurrency}
                    </p>
                    {Number(amount) > 0 && (
                      <p className="mt-1.5 tabular-nums text-text-secondary">
                        {t.calculation}: {formatMoney(Number(amount))} × {formatRate(rateResult.sourceBaseRate)} ÷ {formatRate(rateResult.destinationBaseRate)}
                      </p>
                    )}
                  </div>
                )}
              <div className="flex justify-between gap-3">
                <dt className="text-text-muted">{t.estimatedCredit}</dt>
                <dd className="font-medium tabular-nums text-text-primary">
                  {referenceRate && Number(amount) > 0
                    ? `${formatMoney(Number(amount) * referenceRate)} ${toAccount.currency}`
                    : "—"}
                </dd>
              </div>
            </dl>
            {rateResult?.resolved?.isStale && (
              <p className="mt-3 text-xs text-text-secondary">{t.staleRate}</p>
            )}
          </div>
        )}

        {isCrossCurrency && toAccount && (
          <>
            <label className="flex items-start gap-2 text-xs leading-5 text-text-muted">
              <input
                type="checkbox"
                name="use_custom_destination"
                value="yes"
                checked={useCustomDestination}
                onChange={(event) => {
                  setUseCustomDestination(event.target.checked);
                  setDestinationAmount(event.target.checked ? suggestedDestinationAmount : "");
                }}
                className="mt-1"
              />
              <span>
                <span className="font-medium text-text-secondary">{t.useActualCredit}</span>
                <span className="block">{t.actualCreditHint}</span>
              </span>
            </label>
            {useCustomDestination && (
              <Input
                id="transfer-destination-amount"
                name="destination_amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                label={`${t.actualCredit} (${toAccount.currency})`}
                value={destinationAmount}
                onChange={(event) => setDestinationAmount(event.target.value)}
                placeholder={t.amountPlaceholder}
                required
                className="h-11 py-0"
                error={state.fieldErrors?.destination_amount?.[0]}
              />
            )}
            <p className="text-xs text-text-muted">
              {t.effectiveRate}: {effectiveRate
                ? `1 ${fromAccount.currency} = ${formatRate(effectiveRate)} ${toAccount.currency}`
                : "—"}
            </p>
          </>
        )}

        <Input
          id="transfer-note"
          name="note"
          label={t.noteLabel}
          placeholder={t.notePlaceholder}
          disabled={!hasDestination}
          className="h-11 py-0"
          error={state.fieldErrors?.note?.[0]}
        />

        <Button
          type="submit"
          isLoading={isPending}
          disabled={!hasDestination || !toAccountId || !crossCurrencyReady}
          className="h-11 w-full py-0"
        >
          {isPending ? dict.common.loading : t.submit}
        </Button>
      </div>
    </form>
  );
}
