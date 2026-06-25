# Nevora

Nevora — мультитенантная SaaS-платформа для малого бизнеса: управление
организацией и её рабочими пространствами, CRM, задачи, деньги, подписки,
документы, публичный онлайн-booking, аналитика и AI-ассистент — в одном
приложении с единой моделью прав и изоляцией данных по организациям.

Каждый пользователь работает в контексте организации (`organization`) и
рабочего пространства (`workspace`). Изоляция арендаторов обеспечивается на
уровне БД через PostgreSQL Row Level Security, а не только в коде приложения.

## Стек

- **Next.js 16** (App Router, Server Components, Server Actions, `proxy.ts`
  вместо middleware) — см. примечание ниже.
- **React 19**, **TypeScript**.
- **Supabase** (PostgreSQL + Auth + RLS + RPC) — основное хранилище и
  источник правды для прав доступа.
- **Tailwind CSS v4** + самохостинг шрифтов через `@fontsource`
  (Inter Variable + Geist Mono).
- **Redux Toolkit** — клиентское UI-состояние.
- **Zod** — валидация входных данных и переменных окружения.
- **Resend** — транзакционная почта. **Anthropic SDK** — AI-модуль.
- **Vitest** — тесты.

> **Внимание (Next.js 16):** это не та версия Next.js, что в обучающих данных.
> Перед изменением Next-кода читайте локальную документацию в
> `node_modules/next/dist/docs/`. В частности, middleware переименован в
> `proxy` (файл `proxy.ts` в корне).

## Переменные окружения

Скопируйте `.env.example` в `.env.local` и заполните значения:

| Переменная | Обязательна | Назначение |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | да | URL проекта Supabase (валидируется как URL). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | да | Публичный anon-ключ Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | для rate-limit | Server-only ключ для серверного rate-лимитера. Без него лимит деградирует в no-op (fail-open). |
| `RESEND_API_KEY` | для почты | Ключ Resend для транзакционных писем. |
| `RESEND_FROM_EMAIL` | для почты | Подтверждённый отправитель/домен в Resend. |
| `ANTHROPIC_API_KEY` | для AI | Ключ Anthropic для AI-модуля. |

`lib/env.ts` валидирует обязательные публичные переменные при импорте по
принципу fail-fast: без них приложение (и `next build`) не стартует.

## Локальный запуск

```bash
npm install        # установить зависимости (включая локальные шрифты)
cp .env.example .env.local   # заполнить Supabase-креды
npm run dev        # http://localhost:3000
```

Шрифты поставляются npm-пакетами `@fontsource` и бандлятся при сборке —
интернет для шрифтов на этапе сборки не нужен (важно для CI/офлайн).

## Миграции базы данных

SQL-миграции лежат в `supabase/migrations/` и применяются по порядку номеров
(`000_…` → `038_…`). Они описывают схему, RLS-политики, SECURITY DEFINER RPC и
модель грантов.

```bash
# Локальный стек Supabase (Docker) — рекомендуемый способ:
supabase start            # поднять локальный Postgres + Auth
supabase db reset         # применить все миграции из supabase/migrations/

# Создать новую миграцию (никогда не редактируйте уже применённые файлы):
supabase migration new <name>
```

> Не применяйте миграции на remote-проект из локальной разработки без явного
> согласования. Новые изменения схемы — только новой миграцией с бОльшим
> номером; существующие файлы не переписываются.

Ключевые принципы безопасности БД:

- Все доменные таблицы — под RLS; межтенантный доступ проверяется через
  `is_org_member()` / `is_org_admin()`.
- `SECURITY DEFINER` функции имеют фиксированный `search_path` и явную модель
  `GRANT EXECUTE` (`035_rpc_grant_hardening.sql`, `037_security_definer_grants.sql`):
  - **public** (`anon`): `create_booking_request_public`,
    `check_client_booking_conflict_public`, `get_invite_info` — резолвят
    org/host/service строго по slug/token (без internal ID от клиента);
  - **authenticated-only**: `create_organization`, `create_default_crm_pipeline`,
    `refresh_trial_status`, `invite_member`, `accept_invite`/`decline_invite`,
    `create_invite_link`/`accept_invite_link`, `get_org_member_contact_details`;
  - **internal-only** (EXECUTE отозван у клиентов): provisioning-хелперы и все
    trigger-функции;
  - **RLS-helpers** (`is_org_member` и пр.) намеренно остаются доступными
    `anon`/`authenticated` — они вызываются внутри RLS-выражений.

## Проверки

```bash
npx tsc --noEmit   # типы
npm run lint       # ESLint
npm test           # Vitest (бизнес-логика, права, public-route matching)
npm run build      # production-сборка
```

Те же шаги выполняет CI (`.github/workflows/ci.yml`) на каждый push/PR в `main`.

## Структура

```
app/                 # Next.js App Router: страницы, layout, route handlers
  api/health/        # health-check для monitoring/load balancer (без сессии)
  api/public/        # публичные эндпоинты (booking) — без сессии
  api/internal/      # внутренние эндпоинты — требуют org-контекст
proxy.ts             # Next 16 proxy (бывший middleware): auth + редиректы
lib/                 # инфраструктура: supabase, auth, env, events, rate-limit, http
  auth/              # requireUser / requireOrg → CurrentContext
  context/           # типы контекста + permission-хелперы (isOwner/isAdmin)
  rate-limit/        # DB-backed rate limiter (Postgres, serverless-safe)
shared/              # переиспользуемое: ui, config (routes, i18n), utils
entities/            # доменные модели нижнего уровня
features/            # фиче-композиции UI (todos, crm, members, onboarding, …)
modules/             # вертикальные модули домена (см. ниже)
store/               # Redux store + провайдер
supabase/migrations/ # SQL-миграции (схема, RLS, RPC, гранты)
```

### Модули (`modules/`)

Каждый модуль — самодостаточная вертикаль (actions / queries / services /
schemas / components / types), экспортирующая публичный API через `index.ts`:

- `booking` — публичный онлайн-booking: hosts, services, availability-правила,
  расчёт слотов, заявки.
- `crm` — клиенты, сделки, pipeline/стадии, активности.
- `tasks` — задачи и их статусы (включая ежемесячные повторяющиеся).
- `moneyflow` — счета, категории, транзакции, сводки.
- `subtracker` — подписки и предстоящие списания.
- `documents` — документы с версиями/снапшотами.
- `members` — приглашения и управление участниками организации.
- `billing` — планы, trial-подписки, лимиты.
- `analytics` — виджеты и метрики.
- `ai` — инсайты и рекомендации на базе Anthropic.
- `landing` — публичная посадочная часть.

## Безопасность и rate limiting

- Публичные booking-эндпоинты защищены rate-лимитером на основе Postgres
  (`lib/rate-limit/`, миграции `036`/`038`): он работает в serverless/
  multi-instance среде (в отличие от in-memory) и не требует внешних платных
  сервисов. Write-RPC `check_rate_limit` доступен **только service_role** и
  вызывается серверным клиентом — публичный клиент не может его дёргать
  напрямую. `limit`/`window` зашиты в allowlist по bucket на стороне SQL
  (клиент не задаёт их), `identifier` — SHA-256 hex от `IP (+ organization
  slug)`; raw IP/email/phone не хранятся и не логируются. При превышении —
  `429` + `Retry-After`.
