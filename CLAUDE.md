@AGENTS.md

# Internationalization (i18n) — en / ru / ro

The whole product ships in **English, Russian and Romanian**. Every user-facing
string must go through the dictionary — never hardcode UI text. Audit +
remediation history: `docs/audits/I18N_COMPLIANCE_AUDIT_2026-07-15.md`.

## Locale model (`shared/i18n/constants.ts`)
- `PublicLocale = "en" | "ru" | "ro"` — the single language axis for landing,
  legal pages, `<html lang>` and metadata. Persisted in the `nevora_locale` cookie.
- `Locale` is the app-dictionary locale and is now the **same set** (`ro` has a
  full app dictionary), so `toAppLocale` is the identity. `PublicLocale` is a
  type-alias of `Locale`; don't reintroduce an `ro → en` fallback.
- `getPublicLocale()` (cookie, en/ru/ro) drives `<html lang>` and landing/legal;
  `getLocale()` / `getDictionary()` serve the app dictionary. Root `layout.tsx`
  sets `<html lang>` from the cookie; landing routes also self-correct via
  `HtmlLangSync`, which keeps the cookie in sync on direct visits.

## Dictionaries (`shared/i18n/dictionaries/{en,ru,ro}.ts`)
- `en.ts` is the source of truth: `type Dictionary = DeepString<typeof en>`.
  `ru.ts` and `ro.ts` **must mirror en's key structure exactly** — `tsc` fails
  otherwise. When you add a string, add the key to **all three** files.
- Preserve interpolation placeholders verbatim (`{name}`, `{{org}}`) and fill
  them with `.replace("{name}", value)` at the call site.

## Wiring strings into components
- There is **no client-side i18n provider**. Server components call
  `getDictionary()` and pass the relevant `dict` slice as a prop to client
  components. Reusable client components take a `t` prop
  (`t: Dictionary["settings"]`, `Dictionary["projects"]`, …).
- Constant-driven labels (statuses, priorities, types) are localized by moving
  the labels into the dictionary keyed by the enum value and passing them down —
  don't render the English `*_LABELS` constants directly in the UI.

## Landing & pricing
- Landing copy is **not** in the shared dictionaries — it lives in
  `modules/landing/constants/landing-content.ts` (strongly-typed lists per locale).
- Pricing separates **stable data** (`modules/billing/plan-catalog.ts`) from
  **localized presentation copy** (`modules/billing/plan-catalog.i18n.ts`);
  `getPublicPlanViews(config, locale)` composes them. The English defaults are
  pinned by tests — keep them byte-identical when editing.
- Billing access / plan-gate copy is `dict.access`, threaded through
  `AccessStateProvider` (dashboard layout) so blocked states localize.

## Terminology glossary (keep consistent; no mixed-language sentences)
| English | Русский | Română |
|---|---|---|
| Action Center | Центр действий | Centrul de acțiuni |
| Workflow | Рабочий процесс | Flux de lucru |
| Work (nav section = Tasks + Projects) | Работа | Lucru |
| Workspace | Рабочее пространство | Spațiu de lucru |
| Dashboard | Сводка / Tablou de bord | Tablou de bord |
| Cash flow | Денежный поток | Flux de numerar |
| Trial | Пробный период | Perioadă de probă |
| Private beta | Закрытая бета | Versiune beta privată |
| Mark as paid | Отметить как оплаченный | Marchează ca plătit |
| AI | ИИ | IA |
| Money (module) | Финансы | Finanțe |
| Capture (action) / Inbox | Добавить / Входящие | Adaugă / Mesaje primite |

Do not leave stray English words (`workflow`, `workspace`, `upgrade`, `cashflow`,
`Mark as paid`) in Russian or Romanian sentences. Keep the brand `Nevora Business
OS` untranslated. Avoid the literal RU `Захват/Захвачено` — use `Добавить/Сохранённое/Входящие`.

## Formatting
- Locale-aware `Intl` where user-visible (map `ru → ru-RU`, `ro → ro-RO`,
  else `en-US`). Some shared formatters are intentionally fixed — check before
  changing them, they affect all locales.

## Persisted language + migrations
- `profiles.language` / `organizations.default_language` allow `('en','ru','ro')`
  (migration `106`). These are a **separate** stored preference from the UI cookie.
- Migrations are applied **manually by the user** (see the migration-baseline
  notes); don't assume a migration is live until confirmed.
