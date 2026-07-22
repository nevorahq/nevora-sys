# Nevora Business OS

**Nevora Business OS** — мультитенантная SaaS-платформа для малого и среднего
бизнеса: задачи, деньги, документы, подписки, аналитика и AI-ассистент
в одной понятной системе. Не отдельные pet-проекты, а единая **Business OS** —
модульный монолит, где модули работают вместе, а изоляция данных по организациям
обеспечивается на уровне БД (PostgreSQL Row Level Security), а не только в коде.

Каждый пользователь работает в контексте организации (`organization`) и
рабочего пространства (`workspace`).

## Текущий статус проекта

Платформа на стадии **MVP / стабилизации**. Сборка, типы и линт — зелёные
(`npm run typecheck && npm run lint && npm test && npm run build`).

| Модуль | Статус |
| --- | --- |
| Auth / Organizations / Workspaces | MVP Ready (ядро) |
| Tasks · Money · Documents · Settings | MVP Ready |
| Subscriptions · Members · Billing · Analytics · AI | Partial |
| Relations · Action Center · Automation | In Progress |
| Booking | Paused (жёстко закрыт: страницы, Server Actions, route handlers и `anon`-гранты в БД) |
| CRM / Clients | Paused (жёстко закрыт; пути чтения загейтены) |

Полная честная разбивка по модулям — [`docs/MODULE_STATUS.md`](docs/MODULE_STATUS.md).
AI — это **ассистент** (саммари, инсайты, рекомендации), а не автономный агент.

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
| `NEXT_PUBLIC_APP_URL` | да | Базовый URL приложения (ссылки в письмах, redirect-и). |
| `SUPABASE_SERVICE_ROLE_KEY` | для rate-limit и sweep | Server-only ключ. Без него rate-лимитер и durable extraction sweep деградируют в no-op (fail-open). |
| `CRON_SECRET` | для cron | **Fail-closed**: без него все `/api/cron/*` отвечают 401. Vercel Cron шлёт его как `Authorization: Bearer`. `openssl rand -hex 32`. |
| `METRICS_SECRET` | для метрик | **Fail-closed**: без него `/api/internal/activation-funnel` и `/api/internal/job-health` отказываются отвечать. Передавать как `Authorization: Bearer <METRICS_SECRET>` и держать отличным от `CRON_SECRET`. |
| `ANTHROPIC_API_KEY` | для AI | AI-модуль (summaries, insights, recommendations) и извлечение из документов. |
| `RESEND_API_KEY` | для почты | Ключ Resend для транзакционных писем. |
| `RESEND_FROM_EMAIL` | для почты | Подтверждённый отправитель/домен в Resend. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | для push | Web-push уведомления. Без них push тихо отключён. |
| `BILLING_MODE` | да | `private_beta` (по умолчанию) отключает self-serve checkout и Customer Portal. `paid_beta`/`production` требуют серверных секретов Paddle. |
| `BILLING_PROVIDER` | да | Провайдер биллинга; сейчас `paddle`. |
| `PADDLE_ENV`, `PADDLE_API_KEY`, `PADDLE_CLIENT_TOKEN`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_SELLER_ID` | для платного режима | Не нужны в `private_beta`. |
| `PADDLE_PRICE_*` | для платного режима | Six Price ID (starter/pro/business × monthly/yearly). |
| `DOCUMENT_EXTRACTION_MOCK` | нет | `1`/`true` — заглушка AI-извлечения для локальной отладки без трат. |
| `RUN_DB_TESTS` | нет | `1` — включает opt-in интеграционный тест против **локальной** БД. |

Полный список с комментариями — в [`.env.example`](.env.example); он и есть
источник истины.

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
(`000_…` → `101_…`; все 101 применены на remote, следующий свободный номер —
`102`, номер `054` — известный пропуск). Они описывают схему, RLS-политики,
SECURITY DEFINER RPC, индексы и модель грантов.

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
npm run typecheck  # next typegen + tsc --noEmit
npm run lint       # ESLint
npm test           # Vitest (бизнес-логика, права, public-route matching)
npm run build      # production-сборка
```

Те же шаги выполняет CI (`.github/workflows/ci.yml`) на каждый push/PR в `main`:
install → `next typegen` → typecheck → lint → test → build. Прогоняйте их
локально перед commit.

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

- `tasks` — задачи, статусы (3 состояния), проекты, повторяющиеся, история дедлайнов.
- `moneyflow` — счета, категории, транзакции, переводы, мультивалютность, сводки.
- `documents` — документы с версиями/снапшотами, приватные загрузки, AI-извлечение.
- `subtracker` — подписки и предстоящие списания.
- `settings` — профиль, workspace, участники, billing, аватары.
- `members` — приглашения и управление участниками организации.
- `billing` — планы, trial-подписки, лимиты.
- `analytics` — метрики дашборда, таймлайн активности, статистика по модулям.
- `ai` — инсайты и рекомендации на базе Anthropic (ассистент, не агент).
- `relations` — связи между модулями через `entity_links` *(in progress)*.
- `action-center` — оркестрация сигналов модулей в `action_items` *(in progress)*.
- `automation` — диспетчер доменных событий + хендлеры *(foundation)*.
- `booking` — публичный онлайн-booking *(скрыт из основной навигации)*.
- `crm` — клиенты, сделки, pipeline, активности *(paused)*.
- `landing` — публичная посадочная часть.

Статусы модулей — [`docs/MODULE_STATUS.md`](docs/MODULE_STATUS.md).

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

Полный чек-лист безопасности перед PR — [`docs/SECURITY.md`](docs/SECURITY.md).

## Roadmap

Дорожная карта начинается с **Phase 0 — Stabilization & Source of Truth** (этот
этап) и далее: Core Foundation → Security Layer → стабилизация
Tasks/Money/Documents/Subscriptions → Cross-Module Relations → Automation →
Action Center → Documents Automation → Analytics → AI → SaaS Monetization.
Подробно и со статусами — [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Документация

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — целевая архитектура и жёсткие правила.
- [`docs/MODULE_STATUS.md`](docs/MODULE_STATUS.md) — честный статус каждого модуля.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — фазы, начиная с Phase 0.
- [`docs/project-workflows-and-beta-plan-2026-07-10.md`](docs/project-workflows-and-beta-plan-2026-07-10.md) — карта рабочих процессов, готовность к private/public beta и план закрытия рисков.
- [`docs/PRODUCT_COPY.md`](docs/PRODUCT_COPY.md) — позиционирование и копирайт лендинга.
- [`docs/SECURITY.md`](docs/SECURITY.md) — чек-лист безопасности и tenant-изоляция.
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — запуск, проверки, как добавлять модули.
- [`docs/nevora-architect-prompt.md`](docs/nevora-architect-prompt.md) — system prompt архитектора.
