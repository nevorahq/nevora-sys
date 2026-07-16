# i18n Compliance Audit — Nevora Business OS app

**Date:** 2026-07-15
**Scope:** in-app surfaces (dashboard + auth). Landing/legal already tri-lingual.
**Trigger:** many user-visible strings render in a fixed language regardless of
the selected locale (en/ru/ro). The app is a patchwork: some screens hardcoded
in English, some in Russian.

Locale mechanics are correct (cookie → `getLocale`/`getDictionary`, `<html lang>`,
3-language switcher). The problem is **coverage**: whole sections never read the
dictionary.

## A. No dictionary section → hardcoded ENGLISH (ru/ro users see English)

`en.ts` has no top-level `settings`, `members`, `analytics`, `ai`, `relations`,
`projects`, `financialTask` sections. These render string literals directly.

| Area | Key files | ~strings |
|---|---|---|
| Settings (whole module) | `modules/settings/components/{ProfileForm,WorkspaceForm,InviteMemberDialog,BillingOverview,DeleteAccountSection,SettingsHeader,SettingsSidebar}.tsx`, `modules/settings/notifications/components/notification-settings-form.tsx`, `app/(dashboard)/dashboard/settings/**` | ~68 |
| Analytics | `app/(dashboard)/dashboard/analytics/page.tsx` | ~8 |
| AI (labels) | `app/(dashboard)/dashboard/ai/page.tsx` | ~5 |
| Relations | `modules/relations/components/*` | ~9 |
| Tasks / Projects | `modules/tasks/projects/components/*`, `app/(dashboard)/dashboard/tasks/financial/page.tsx` | ~17 |
| Financial task panel | `modules/tasks/components/financial-task-panel.tsx` | ~11 |
| Documents (partial) | `modules/documents/components/{new-document-form,document-extraction-review,document-detail-actions,create-account-inline-cta}.tsx` | ~33 |

## B. Hardcoded RUSSIAN (en/ro users see Russian)

- `modules/billing/services/access-state-ui.ts:45-48` — `DEFAULT_BLOCKED_ACTION_MESSAGE`,
  `INVITE_BLOCKED_MESSAGE`, `AI_BLOCKED_MESSAGE`, `UPLOAD_BLOCKED_MESSAGE` + `RESTRICTED_COPY`
  (all Russian). Surface on money/documents/ai/members/settings blocked states.
- `modules/billing/components/access-state.tsx:102,111,127` — defaults `title="Доступ ограничен"`,
  `"Для продолжения работы выберите платный план."`, CTA `label="Перейти к оплате"`.
- `modules/members/services/invite-protection.ts:56+` — `MEMBER_LIMIT_MESSAGE` etc. (Russian).
- Booking: `modules/booking/components/month-calendar.tsx` (Russian weekday/month arrays),
  `app/(dashboard)/dashboard/booking/{hosts,services}/_components/*-client.tsx` (`title="Удалить"/"Редактировать"`),
  `modules/booking/{services,hosts}/components/edit-*-form.tsx` (`"Редактировать услугу/специалиста"`).

## C. Mixed language on one screen

- `app/(dashboard)/dashboard/ai/page.tsx` — English labels (`Recommendations`, `Insights`,
  `No recommendations yet`) + Russian `title="AI ограничен"` + untranslated `AI` (glossary: ИИ/IA).
- Documents/Money under a plan block — English page + Russian alert.

## D. Incomplete Romanian

- Language selectors in Profile (`modules/settings/components/ProfileForm.tsx:26`) and
  Workspace (`WorkspaceForm.tsx:41`) offer only `English`/`Русский`. This is a **persisted**
  field (`profiles.language`, `organizations.default_language`) with a DB CHECK
  `IN ('en','ru')` (migration `065_settings_module.sql`) → needs a migration to widen to `ro`.

## E. Minor

- Language-switcher `aria-label` prefix `"Language:"` is English in all locales.
- `shared/utils/format-date.ts` / `format-money.ts` are hardcoded `ru-RU` → dates/amounts
  render in Russian format even for en/ro.

## Lower priority

- **CRM** (~64 strings) and most of **Booking** are paused/hidden features — fix after
  the active surfaces.

## Remediation plan (priority: active screens first)

1. **Billing access messages** (§B, cross-cutting) — add a `dict.access` section (en/ru/ro),
   thread a localized `AccessCopy` through `AccessStateProvider` (dashboard layout already has
   `dict`). Keep `defaultAccessCopy` byte-identical so `access-state-ui.test.ts` stays green.
2. **RO language selector** (§D) — migration `106` widening the CHECK to `('en','ru','ro')`,
   update Zod + selector options.
3. **Settings** (§A) — add `dict.settings`, pass slices from the server settings pages to the
   client forms.
4. **AI** (§A/§C) + **Analytics** (§A) — add `dict.ai` / `dict.analytics`, give the pages `dict`.
5. **Documents**, **Tasks/Projects**, **Financial task panel** — add sections, wire components.
6. **Booking / CRM** (paused) — last.
