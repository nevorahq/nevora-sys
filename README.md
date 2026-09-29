# Nevora Business OS

**Nevora Business OS** — мультитенантная SaaS-платформа для фрилансеров и малого
бизнеса: одно рабочее пространство, куда дела попадают откуда угодно — из
приложения, Telegram, Slack или пересланного письма. Nevora превращает их в
черновики задач и расходов, пользователь подтверждает, а Центр действий
показывает, что требует внимания сегодня.

Архитектурно это модульный монолит на Next.js + Supabase. Изоляция данных по
организациям обеспечивается на уровне БД (PostgreSQL Row Level Security), а не
только в коде. Каждый пользователь работает в контексте организации
(`organization`) и рабочего пространства (`workspace`).

Прод: [bussines.nevorahq.com](https://bussines.nevorahq.com) (Netlify).

## Текущий статус проекта

**Закрытая бета** (`BILLING_MODE=private_beta`): продукт работает, пробный
период на 14 дней открыт всем, платный checkout не включён. Открытых P0/P1 нет
([`docs/release/p0-p1-issue-register.md`](docs/release/p0-p1-issue-register.md)).
CI (`verify` + `db` + `secrets`) зелёный на `main`.

| Модуль | Статус |
| --- | --- |
| Auth / Organizations / Workspaces | MVP Ready (ядро) |
| Центр действий · Входящие · Задачи + Проекты · Финансы · Документы · Подписки · Настройки · Уведомления | MVP Ready |
| Каналы: Telegram · Slack · пересылка email | MVP Ready для текста; медиа и голос — Partial |
| Members · Billing · Developer Access · импорт счетов из Gmail | Partial |
| Overview · Analytics · AI (страницы) | Partial, не связаны с навигацией |
| Relations · Automation · отдельные сервисы `apps/*` | In Progress |
| Booking · CRM | Paused (жёстко закрыты: страницы, Server Actions, route handlers и `anon`-гранты в БД) |

Полная разбивка по модулям — [`docs/MODULE_STATUS.md`](docs/MODULE_STATUS.md).

Ключевые продуктовые правила:

- **Сначала подтверждение.** Ничто — ни ИИ, ни канал, ни cron — не создаёт
  задачу и не проводит деньги без явного действия пользователя.
- **Задачи, Финансы и Подписки не связаны мостами** (ADR 001, миграция `115`):
  отметка оплаты подписки не создаёт транзакцию в Финансах.
- **ИИ — ассистент, а не агент.** Он пишет только черновики; каждый вызов
  учитывается в общем месячном лимите `ai_calls`.

Что осталось до платной беты и публичного запуска: сквозной прогон Paddle в
sandbox, ротация ключа I-07, передача владения организацией (issue #39) и
контролируемая бета на 5 пользователях — см. [`docs/release/`](docs/release/).

## Стек

- **Next.js 16** (App Router, Server Components, Server Actions, `proxy.ts`
  вместо middleware) — см. примечание ниже.
- **React 19**, **TypeScript**, npm workspaces (`apps/*`, `packages/*`).
- **Supabase** (PostgreSQL + Auth + RLS + RPC + Storage) — основное хранилище и
  источник правды для прав доступа.
- **Tailwind CSS v4** + самохостинг шрифтов через `@fontsource`
  (Inter Variable + Geist Mono).
- **Redux Toolkit** — клиентское UI-состояние. **Zod** — валидация входных
  данных и переменных окружения.
- **Anthropic SDK** — распознавание намерений во Входящих и извлечение данных из
  документов. **OpenAI** (через `fetch`) — только расшифровка голосовых.
- **Resend** — транзакционная почта и входящая почта (Resend Inbound).
- **Paddle** — биллинг (в закрытой бете выключен).
- **Sentry** (`@sentry/browser`, `@sentry/node`) через vendor-neutral seam — не
  ставьте `@sentry/nextjs`.
- **Vitest** — тесты; SQL-харнессы в `supabase/tests/`.

> **Внимание (Next.js 16):** это не та версия Next.js, что в обучающих данных.
> Перед изменением Next-кода читайте локальную документацию в
> `node_modules/next/dist/docs/`. В частности, middleware переименован в
> `proxy` (файл `proxy.ts` в корне). Любой новый машинный маршрут (webhook, cron)
> нужно добавить в `MACHINE_ROUTES` (`shared/config/routes.ts`), иначе proxy
> перенаправит его на `/login`.

## Языки

Весь продукт — лендинг, правовые страницы и приложение — на **английском,
русском и румынском**. Строки интерфейса живут в
`shared/i18n/dictionaries/{en,ru,ro}.ts` (ключи обязаны совпадать), контент
лендинга — в `modules/landing/constants/landing-content.ts`. Правила и глоссарий
терминов — в [`CLAUDE.md`](CLAUDE.md).

## Переменные окружения

Скопируйте `.env.example` в `.env.local` и заполните значения:

| Переменная | Обязательна | Назначение |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | да | URL проекта Supabase (валидируется как URL). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | да | Публичный anon-ключ Supabase. |
| `NEXT_PUBLIC_APP_URL` | да | Базовый URL приложения (ссылки в письмах, redirect-и). |
| `SUPABASE_SERVICE_ROLE_KEY` | для cron, каналов и удаления аккаунтов | Server-only ключ. Нужен sweep-задачам, каналам (у входящих сообщений нет сессии) и удалению аккаунтов. |
| `CRON_SECRET` | для cron | **Fail-closed**: без него все `/api/cron/*` отвечают 401. Netlify Scheduled Functions передают его как `Authorization: Bearer`. `openssl rand -hex 32`. |
| `METRICS_SECRET` | для метрик | **Fail-closed**: без него `/api/internal/activation-funnel` и `/api/internal/job-health` не отвечают. Держать отличным от `CRON_SECRET`. |
| `ANTHROPIC_API_KEY` | для ИИ | Входящие (черновики задач), извлечение из документов и чеков, AI-модуль. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | для почты | Транзакционные письма; ключ также читает входящие письма. |
| `RESEND_INBOUND_WEBHOOK_SECRET`, `INBOUND_EMAIL_DOMAIN` | для пересылки email | Подпись webhook `email.received` и домен адресов `inbox-<token>@<domain>`. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | для Telegram | Бот для добавления дел. Webhook регистрируется `node scripts/telegram-set-webhook.mjs`. |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` | для Slack | OAuth-подключение и проверка подписи shortcut «Send to Nevora». |
| `OPENAI_API_KEY`, `OPENAI_TRANSCRIBE_MODEL` | для голосовых | Расшифровка голосовых из Telegram. Без ключа бот просит прислать текст. |
| `GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET`, `GOOGLE_GMAIL_REDIRECT_URI`, `GMAIL_TOKEN_ENCRYPTION_KEY` | для импорта из Gmail | Read-only OAuth для импорта счетов в Подписки; токены шифруются. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | для push | Web-push уведомления. Без них push тихо отключён. |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | рекомендуется | Ошибки сервера и браузера, алерты сверки лимитов. |
| `BILLING_MODE` | нет | Без значения — `private_beta`: checkout и Customer Portal выключены. `paid_beta`/`production` требуют секретов Paddle. |
| `BILLING_PROVIDER` | нет | Провайдер биллинга; сейчас `paddle`. |
| `PADDLE_ENV`, `PADDLE_API_KEY`, `PADDLE_CLIENT_TOKEN`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_SELLER_ID`, `PADDLE_PRICE_*` | для платного режима | Не нужны в `private_beta`. Проверяется только непустота, не валидность. |
| `TASKS_TRANSPORT`, `TASKS_API_URL`, `TASKS_SERVICE_AUTH_SECRET`, `TASKS_SHADOW_READ_PERCENT` | нет | Транспорт к отдельному сервису Задач: `in-process` (по умолчанию) → `shadow` → `http-read` → `http`. |
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

Отдельные сервисы запускаются так же: `npm run dev:tasks`,
`npm run dev:subscriptions`, `npm run dev:finance`.

## Миграции базы данных

SQL-миграции лежат в `supabase/migrations/` и применяются по порядку номеров
(`000_…` → `125_…`; все применены на remote, следующий свободный номер —
`126`, номер `054` — известный пропуск). Они описывают схему, RLS-политики,
SECURITY DEFINER RPC, индексы и модель грантов. К многим миграциям есть
SQL-харнесс в `supabase/tests/`, который CI прогоняет на чистой БД.

Миграции на remote применяются **вручную** владельцем проекта — не считайте
новую миграцию применённой, пока это не подтверждено.

```bash
# Локальный стек Supabase (Docker) — рекомендуемый способ:
supabase start            # поднять локальный Postgres + Auth
supabase db reset         # применить все миграции из supabase/migrations/

# Создать новую миграцию (никогда не редактируйте уже применённые файлы):
supabase migration new <name>
```

> Новые изменения схемы — только новой миграцией с бОльшим номером;
> существующие файлы не переписываются.

Ключевые принципы безопасности БД:

- Все доменные таблицы — под RLS; межтенантный доступ проверяется через
  `is_org_member()` / `is_org_admin()`.
- `SECURITY DEFINER` функции имеют фиксированный `search_path` и явную модель
  `GRANT EXECUTE` (`035_rpc_grant_hardening.sql`, `037_security_definer_grants.sql`):
  - **public** (`anon`): `get_invite_info` — резолвит приглашение строго по
    токену. Публичные booking-RPC у `anon` отозваны миграцией `098`, пока
    Booking на паузе;
  - **authenticated-only**: `create_organization`, `create_default_crm_pipeline`, `refresh_trial_status`,
    `invite_member`, `accept_invite`/`decline_invite`,
    `create_invite_link`/`accept_invite_link`, `get_org_member_contact_details`;
  - **service_role-only**: RPC для сервисной идентичности (учёт лимитов для
    отдельного сервиса Задач `114` и загрузок из каналов `122`), `check_rate_limit`;
  - **internal-only** (EXECUTE отозван у клиентов): provisioning-хелперы и все
    trigger-функции;
  - **RLS-helpers** (`is_org_member` и пр.) намеренно остаются доступными
    `anon`/`authenticated` — они вызываются внутри RLS-выражений.

## Проверки

```bash
npm run typecheck  # next typegen + tsc --noEmit + пакеты и apps/*
npm run lint       # ESLint
npm test           # Vitest
npm run build      # production-сборка
```

CI (`.github/workflows/ci.yml`) на каждый push/PR в `main` запускает три джобы:

- `secrets` — gitleaks по всей истории;
- `verify` — typecheck → lint → test → build, плюс сборка, smoke-тест и
  контейнер отдельного сервиса Задач;
- `db` — поднимает локальный Supabase, применяет все миграции с нуля и
  прогоняет SQL-харнессы из `supabase/tests/`.

Прогоняйте проверки локально перед commit. `npm run hooks:install` включает
pre-commit hook с gitleaks.

## Деплой и фоновые задачи

- Прод — **Netlify** (сайт `nevora-business-os`). `vercel.json` не используется:
  Vercel Cron на Netlify не срабатывает.
- Фоновые задачи — **Netlify Scheduled Functions** в `netlify/functions/*.mts`.
  Каждая — тонкий триггер, который вызывает `/api/cron/<name>` с `CRON_SECRET`:
  `reminders`, `extraction-sweep`, `action-items-sweep`, `subscription-sweep`,
  `suggestions-sweep`, `trial-sweep`, `purge-deleted-accounts`, `usage-reconcile`.
- Переменные окружения Netlify доходят до функций только после нового деплоя.
- Состояние задач для оператора: `/api/internal/job-health` (с `METRICS_SECRET`).

## Структура

```
app/                 # Next.js App Router: страницы, layout, route handlers
  (products)/        # /tasks, /finance, /subscriptions — канонические маршруты модулей
  (dashboard)/       # /dashboard (Центр действий), /dashboard/inbox, документы и др.
  (platform)/        # /settings/*
  api/channels/      # webhook-и Telegram, Slack, входящей почты (без сессии, по подписи)
  api/cron/          # фоновые задачи (CRON_SECRET)
  api/internal/      # внутренние эндпоинты и совместимость с сервисами apps/*
  api/health/        # health-check для monitoring/load balancer (без сессии)
apps/                # отдельные сервисы: tasks, subscriptions, finance (ADR 001)
packages/            # контракты, API и runtime каждого продукта + financial-state
platform/            # транспортный seam к продуктам (in-process / shadow / http)
proxy.ts             # Next 16 proxy (бывший middleware): auth + редиректы
lib/                 # инфраструктура: supabase, auth, env, events, rate-limit, http
shared/              # переиспользуемое: ui, config (routes), i18n, utils
entities/            # доменные модели нижнего уровня
features/            # фиче-композиции UI (todos, members, onboarding, …)
modules/             # вертикальные модули домена (см. ниже)
netlify/functions/   # Scheduled Functions (cron)
store/               # Redux store + провайдер
supabase/migrations/ # SQL-миграции (схема, RLS, RPC, гранты)
supabase/tests/      # SQL-харнессы миграций
```

Старые адреса `/dashboard/tasks`, `/dashboard/money`, `/dashboard/subscriptions`
и `/dashboard/settings` постоянно перенаправляются на новые (`next.config.ts`).

### Модули (`modules/`)

Каждый модуль — самодостаточная вертикаль (actions / queries / services /
schemas / components / types), экспортирующая публичный API через `index.ts`:

- `action-center` — Центр действий: сводит сигналы модулей в `action_items`, только чтение.
- `planner` — Входящие: добавление текста, фото, документов и сканов чеков, черновики, проекты.
- `channels` — Telegram, Slack и пересылка email поверх общего приёма во Входящие.
- `tasks` — задачи, статусы (3 состояния), проекты, повторяющиеся, история дедлайнов.
- `moneyflow` — Финансы: счета, категории, транзакции, переводы, мультивалютность, правила.
- `documents` — документы с версиями/снапшотами, приватные загрузки, AI-извлечение, коды чеков.
- `review` — подтверждение финансовых черновиков из документов.
- `subtracker` — Подписки: циклы оплаты, напоминания, решения о продлении.
- `integrations` — импорт счетов из Gmail (read-only OAuth).
- `notifications` — колокольчик, история, web-push, обязательные уведомления.
- `settings`, `members`, `onboarding`, `developer` — профиль, пространство, участники, онбординг, доступ разработчика.
- `billing` — планы, пробный период, лимиты и их сверка, Paddle.
- `analytics`, `ai` — страницы метрик и инсайтов *(partial, не в меню)*.
- `relations` — связи между модулями через `entity_links` *(in progress)*.
- `automation` — диспетчер доменных событий + хендлеры *(foundation)*.
- `app-shell`, `landing`, `legal` — общая оболочка приложения, лендинг, правовые страницы.
- `booking`, `crm` — *(paused, жёстко закрыты)*.

Статусы модулей — [`docs/MODULE_STATUS.md`](docs/MODULE_STATUS.md).

## Безопасность

- Webhook-и каналов проверяют подпись до любой работы (секретный заголовок
  Telegram, подпись Slack, Svix-подпись Resend) и принимают сообщения только от
  привязанных аккаунтов.
- Внутренние запросы между приложением и сервисами `apps/*` подписываются HMAC
  (префиксы `nts1.` / `nss1.` / `nfs1.`).
- Rate-лимитер на Postgres (`lib/rate-limit/`, миграции `036`/`038`) работает в
  serverless/multi-instance среде. Сейчас он защищает публичные booking-эндпоинты,
  которые на паузе и отвечают 404. `check_rate_limit` доступен **только
  service_role**; `identifier` — SHA-256 от `IP (+ organization slug)`, raw
  IP/email/phone не хранятся.
- Гарантии «сначала подтверждение», идемпотентность оплаты, «прочитано ≠
  решено», границы ИИ и изоляция данных закреплены контрактными тестами
  (`test/release-invariants.test.ts` и соседние).

Полный чек-лист безопасности перед PR — [`docs/SECURITY.md`](docs/SECURITY.md).

## Документация

- [`docs/README.md`](docs/README.md) — оглавление всей документации.
- [`docs/MODULE_STATUS.md`](docs/MODULE_STATUS.md) — честный статус каждого модуля.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — целевая архитектура и жёсткие правила.
- [`docs/adr/`](docs/adr/) — архитектурные решения: границы модулей (001), приём дел из каналов (002).
- [`docs/contracts/`](docs/contracts/) — контракты: финансовые состояния, внимание, уведомления, ИИ, биллинг.
- [`docs/release/`](docs/release/) — реестр P0/P1, launch gate, чек-лист перехода на платную бету.
- [`docs/runbooks/`](docs/runbooks/) — действия при инцидентах и переключении сервисов.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — фазы и их статусы.
- [`docs/PRODUCT_COPY.md`](docs/PRODUCT_COPY.md) — позиционирование и копирайт.
- [`docs/SECURITY.md`](docs/SECURITY.md) — чек-лист безопасности и tenant-изоляция.
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — запуск, проверки, как добавлять модули.
- [`docs/archive/`](docs/archive/) — датированные отчёты и устаревшие планы (только история).
