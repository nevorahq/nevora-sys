"use client";

import { useMemo, useState } from "react";
import { renewalDecisionDueDate } from "@nevora/subscriptions-contracts";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface RenewalFormFieldsProps {
  dict: Dictionary;
  defaultDate: string;
  defaultAutoRenews?: boolean;
  defaultReminderDays?: number | null;
  dateError?: string;
  reminderError?: string;
  idPrefix: string;
}

function interpolate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, value),
    template,
  );
}

export function RenewalFormFields({
  dict,
  defaultDate,
  defaultAutoRenews = true,
  defaultReminderDays = 7,
  dateError,
  reminderError,
  idPrefix,
}: RenewalFormFieldsProps) {
  const t = dict.subscriptions.form;
  const [renewalDate, setRenewalDate] = useState(defaultDate);
  const [autoRenews, setAutoRenews] = useState(defaultAutoRenews);
  const [reminderDays, setReminderDays] = useState(defaultReminderDays == null ? "" : String(defaultReminderDays));

  const preview = useMemo(() => {
    const days = Number(reminderDays);
    if (!autoRenews || !renewalDate || !Number.isInteger(days) || days < 1 || days > 180) return null;
    try {
      return interpolate(t.decisionPreview, {
        decisionDate: renewalDecisionDueDate(renewalDate, days),
        renewalDate,
      });
    } catch {
      return null;
    }
  }, [autoRenews, reminderDays, renewalDate, t.decisionPreview]);

  return (
    <>
      <Input
        id={`${idPrefix}-next-date`}
        name="next_billing_date"
        type="date"
        label={t.nextDateLabel}
        value={renewalDate}
        min={new Date().toISOString().slice(0, 10)}
        onChange={(event) => setRenewalDate(event.target.value)}
        required
        error={dateError}
      />
      <Select
        id={`${idPrefix}-auto-renews`}
        name="auto_renews"
        label={t.autoRenewsLabel}
        value={String(autoRenews)}
        onChange={(event) => setAutoRenews(event.target.value === "true")}
        options={[
          { value: "true", label: t.autoRenewsYes },
          { value: "false", label: t.autoRenewsNo },
        ]}
      />
      <div className="sm:col-span-2">
        <Input
          id={`${idPrefix}-reminder-days`}
          name="renewal_reminder_days"
          type="number"
          min="1"
          max="180"
          step="1"
          label={t.reminderLabel}
          placeholder={t.never}
          value={reminderDays}
          onChange={(event) => setReminderDays(event.target.value)}
          error={reminderError}
          disabled={!autoRenews}
        />
        <p className="mt-1.5 text-xs leading-5 text-text-muted">{preview ?? t.reminderHint}</p>
      </div>
    </>
  );
}
