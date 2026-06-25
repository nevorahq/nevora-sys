"use client";

import { useActionState, useId, useRef } from "react";
import { createOrganizationAction } from "../actions/create-organization.action";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_NAMES,
  type Currency,
} from "@/shared/config/currencies";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface OnboardingFormProps {
  dict: Dictionary;
  /** Валюта по умолчанию, определённая по стране запроса. Редактируемая. */
  detectedCurrency: Currency;
}

const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES.map((code) => ({
  value: code,
  label: `${code} — ${CURRENCY_NAMES[code]}`,
}));

/**
 * Форма создания организации.
 *
 * Slug автогенерируется из названия (useEffect):
 *   "Acme Corp" → "acme-corp"
 *   Пользователь может изменить slug вручную.
 *
 * После ручного изменения slug — автогенерация останавливается
 * (флаг slugManuallyEdited через ref).
 *
 * useActionState: стандартный паттерн для Server Actions в App Router.
 * isPending: показывает spinner, блокирует повторную отправку.
 */
export function OnboardingForm({ dict, detectedCurrency }: OnboardingFormProps) {
  const t = dict.onboarding;
  const nameInputId = useId();
  const slugInputId = useId();
  const currencyInputId = useId();

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    createOrganizationAction,
    {},
  );

  // Refs для управления input'ами напрямую без контролируемого state
  const nameRef = useRef<HTMLInputElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);
  const slugManuallyEdited = useRef(false);

  // Автогенерация slug из названия
  // Работает только пока пользователь не отредактировал slug вручную
  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (slugManuallyEdited.current) return;

    const generated = e.target.value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-") // всё кроме букв и цифр → дефис
      .replace(/^-+|-+$/g, "")      // убрать дефисы в начале/конце
      .slice(0, 50);

    if (slugRef.current) {
      slugRef.current.value = generated;
    }
  }

  function handleSlugChange() {
    slugManuallyEdited.current = true;
  }

  return (
    <Card className="w-full max-w-md">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-text-primary">{t.title}</h1>
        <p className="mt-1.5 text-sm text-text-secondary">{t.subtitle}</p>
      </div>

      {state.error && (
        <div
          className="mb-4 rounded-(--neu-radius-md) bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        {/* Organization name */}
        <Input
          ref={nameRef}
          id={nameInputId}
          name="name"
          type="text"
          label={t.nameLabel}
          placeholder={t.namePlaceholder}
          required
          autoComplete="organization"
          autoFocus
          onChange={handleNameChange}
          error={state.fieldErrors?.name?.[0]}
        />

        {/* Slug */}
        <div className="space-y-1">
          <Input
            ref={slugRef}
            id={slugInputId}
            name="slug"
            type="text"
            label={t.slugLabel}
            placeholder={t.slugPlaceholder}
            required
            autoComplete="off"
            onChange={handleSlugChange}
            error={state.fieldErrors?.slug?.[0]}
          />
          <p className="text-xs text-text-muted">{t.slugHint}</p>
        </div>

        {/* Base currency — предзаполнено по гео, пользователь может изменить */}
        <div className="space-y-1">
          <Select
            id={currencyInputId}
            name="baseCurrency"
            label={t.currencyLabel}
            options={CURRENCY_OPTIONS}
            defaultValue={detectedCurrency}
            error={state.fieldErrors?.baseCurrency?.[0]}
          />
          <p className="text-xs text-text-muted">{t.currencyHint}</p>
        </div>

        <Button type="submit" className="mt-2 w-full" isLoading={isPending}>
          {isPending ? dict.common.loading : t.submitButton}
        </Button>
      </form>
    </Card>
  );
}
