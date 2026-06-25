import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@/shared/config/currencies";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/**
 * Схема создания организации.
 *
 * slug-валидация повторяет regexp в create_organization() на уровне БД.
 * Зачем дублировать: fail fast на уровне Zod = понятная ошибка в UI
 * до того, как запрос дойдёт до БД.
 *
 * Слои валидации:
 *   UI (required) → Zod (format) → DB function (regexp) → UNIQUE index
 */
export function getOnboardingSchema(errors: Dictionary["onboarding"]["errors"]) {
  return z.object({
    name: z
      .string()
      .min(2, errors.nameMin)
      .max(100, errors.nameMax)
      .trim(),

    slug: z
      .string()
      .min(3, errors.slugInvalid)
      .max(50, errors.slugInvalid)
      .regex(
        /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/,
        errors.slugInvalid,
      ),

    // Базовая валюта: гео-подсказка в форме, но финальное значение
    // выбирает пользователь. Принимаем только из allowlist.
    baseCurrency: z.enum(SUPPORTED_CURRENCIES, {
      message: errors.currencyInvalid,
    }),
  });
}

export type OnboardingFormData = z.infer<
  ReturnType<typeof getOnboardingSchema>
>;
