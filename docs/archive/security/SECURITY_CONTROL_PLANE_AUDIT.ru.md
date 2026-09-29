# Аудит Security Control Plane

> **Результат Фазы 0.** Аудит только на чтение. Изменений схемы или кода приложения не вносилось.
> **Дата:** 2026-07-06 · **Ветка:** `main` · **Область:** аутентификация, мультитенантность, авторизация, биллинг/trial-права, инвайты, RLS, использование service role, утечки сырого email/PII, риски обхода записи.

## Методика и достоверность

Кодовая база большая: **139** файлов `"use server"`, **88** миграций, **~50** функций `SECURITY DEFINER`, **19** route handlers. Все критичные для безопасности *пути* (auth-хелперы, `requireOrg`, миграция trial-защиты 086, invite-RPC, все точки вызова service role, миграции изоляции 087/088) прочитаны полностью. Общая поверхность мутаций (CRUD Server Actions по модулям) исследована **выборочно** — на предмет паттерна защиты, а не построчно по всем 139.

- **Высокая уверенность:** auth-флоу, enforcement trial/биллинга, инвентарь service role, invite-флоу, точки утечки сырого email.
- **Требует отдельного прохода (отмечено по месту):** полная проверка RLS `WITH CHECK` по каждой таблице и механический аудит `search_path` для всех 50 SECURITY DEFINER функций.

---

## Резюме для руководства

Control plane **структурно надёжен и построен по принципу defense-in-depth**. Тенантность выводится на сервере (`requireOrg`), org-cookie напрямую не доверяется, RPC с мутациями повторно проверяют `auth.uid()` + membership + роль, а защита от повторного trial (миграция 086) уже закрывает дыру «вторая организация = второй trial» на уровне БД через unique-констрейнты. `changePlanAction` корректно отказывается активировать платные и trial-планы из браузера.

**P0** (живой, кросс-тенантный, эксплуатируемый прямо сейчас) дефект в исследованной поверхности **не обнаружен**. Существенные пробелы — это **P1-хардненинг**:

1. **Service role используется внутри Server Actions, запускаемых пользователем** — для push-подписок; обходит RLS как слой защиты (записи ограничены контекстом, поэтому не кросс-тенантные, но нарушают least-privilege / deny-by-default).
2. **Сырой email пишется в `audit_logs` / `domain_events`** экшенами инвайтов и CRM — прямое нарушение принципа «никакого сырого email в audit/event-таблицах».
3. **Trial-идентичность биллинга — несолёный `sha256(lower(trim(email)))`** — миграция 086 сама документирует это как отложенный пробел. Фаза 1 требует HMAC-SHA256 с серверным pepper. Несолёное хеширование перечислимо (rainbow-table) для email.
4. **Как минимум одна легаси SECURITY DEFINER функция (`init_free_subscription`, 012) без явного `search_path`** — нужен полный проход.

---

## Текущий Auth-флоу

Supabase SSR (`@supabase/ssr`), сессии на cookie. Кастомного auth-провайдера нет.

| Слой | Файл | Роль |
|---|---|---|
| Серверный клиент сессии | `lib/supabase/server.ts` | RLS-ограниченный `authenticated`-клиент для Server Components/Actions |
| Браузерный клиент | `lib/supabase/client.ts` | anon-клиент |
| Текущий пользователь | `lib/auth/get-current-user.ts` | читает сессию; возвращает `User \| null` |
| Жёсткий гейт (user) | `lib/auth/require-user.ts` | `redirect(/login)` если не авторизован; **вызывается внутри каждого Server Action** (не только proxy) |
| Edge-гейт | `proxy.ts` | Auth на уровне HTTP (Next.js proxy/middleware) — «defense in depth: proxy + requireUser» |
| UI логина/регистрации | `app/(auth)/login/page.tsx`, `.../register/page.tsx` → `features/auth/components/*` | Supabase auth-формы |

**Хорошо:** `require-user.ts` явно документирует, что *не* полагается только на proxy, согласно гайдам Next.js 16 — auth перепроверяется в каждой серверной функции.

---

## Текущее разрешение Organization / Workspace

`lib/auth/require-org.ts` (обёрнут в React `cache()`), опирается на `resolve-active-organization.ts` + `organization-cookie.ts`.

- Загружает **все активные membership** для `auth.uid()` (`memberships` join `organizations`).
- Активная org выбирается `resolveActiveOrganizationId(records, cookieHint)` — cookie `active_org_id` трактуется **только как подсказка** и валидируется против реальных membership (напрямую не доверяется). Детерминированный fallback на старейший активный membership.
- Нет membership / нет workspace → `redirect(/onboarding)` (fail-closed).
- Возвращает типизированный `CurrentContext { user, org, membership, role, permissions, workspace }`.

**Хорошо:** мульти-org резолвер — единственная точка входа; последующие мутации берут `org.id` из этого контекста, а не от клиента.

---

## Текущая модель разрешений

Выводится из роли, без таблицы `role_permissions`. `ROLE_PERMISSIONS: Record<OrgRole, string[]>` в `require-org.ts:48` зеркалит DB-хелперы (`is_org_admin`, `can_write_data`, `can_delete_data` из `002_security_functions.sql`).

| Роль | Запись | Удаление | Биллинг | Финансовый execute | Заметки |
|---|---|---|---|---|---|
| owner | ✓ | ✓ | ✓ | ✓ | полный набор вкл. `developer.manage` |
| admin | ✓ | ✓ | ✓ | ✓ | без `org.delete` |
| manager | ✓ | ✓ | — | — (только subscription/doc) | |
| member | ✓ | — | — | — (только safe quick actions) | capture inbox owner-scoped |

**Хорошо:** набор разрешений UI — это *зеркало* enforcement в БД, а не источник правды — соответствует принципу «бэкенд-авторизация обязательна, даже если UI прячет действие». Финансовые/биллинговые execute ограничены owner/admin и в наборе, и (по заметке аудита) в RPC.

---

## Текущий Enforcement Биллинг / Trial / План

Источник правды — БД. Ключевая миграция: **086_trial_reuse_protection.sql** (применена на remote по памяти проекта).

- **`billing_trial_claims`** — одна строка на billing-owner identity. `UNIQUE(user_id)`, `UNIQUE(normalized_email_hash)`, частичный `UNIQUE(billing_customer_id)`. RLS: SELECT own-or-admin; **нет политик INSERT/UPDATE/DELETE** (пишется только SECURITY DEFINER функциями — никакого service role в логике приложения). ✓
- **`init_trial_subscription(org, owner)`** (SECURITY DEFINER, `search_path` задан) — атомарный claim; при unique-violation выдаёт **`expired`/read-only** подписку вместо trial. Вызывается только из `create_organization()`.
- **`check_trial_eligibility()`** — identity строго из `auth.uid()`, без client payload; только UX, `GRANT ... authenticated`. Используется `get-trial-eligibility.ts` (fail-open ради UX, т.к. реальный guard — констрейнты БД).
- **`consume_expired_trials()`** — cron-sweep, `GRANT ... service_role` только. Запускается `app/api/cron/trial-sweep/route.ts` (Bearer `CRON_SECRET`, fail-closed).
- **`changePlanAction`** (`modules/billing/actions/change-plan.action.ts`): отклоняет `planSlug === "trial"` (нет воскрешения trial) **и** отклоняет любую активацию платного плана из браузера («активируется после подтверждения оплаты»). ✓ Правильная позиция до появления webhook платёжного провайдера.

**Пробел (P1):** `normalized_email_hash()` — это чистый `sha256(lower(trim(email)))` **без pepper/HMAC** — комментарии миграции 086 это признают («в БД нет серверного секрета… salted/keyed hash — будущее hardening»). Это основная цель Фазы 1.

---

## Текущий Invite-флоу

Все invite-мутации идут через SECURITY DEFINER RPC, которые повторно проверяют авторизацию на сервере (guard в Server Action — только UX, обойти прямым вызовом RPC нельзя).

| Экшен | RPC | Защита |
|---|---|---|
| `invite-member.action.ts` | `invite_member(org,email,role)` | requireOrg + owner/admin (UI) → RPC перепроверяет admin, лимит участников, trial-expired, существование юзера |
| `create-invite-link.action.ts` | `create_invite_link(org,role)` | owner/admin → RPC перепроверяет; возвращает непрозрачный токен, клиент строит `/invite/<token>` |
| `accept-invite.action.ts` | `accept_invite(org)` | `requireUser` (у invited-only юзера нет активной org); RPC резолвит membership по `auth.uid()` — клиентский `organizationId` валидируется, не доверяется |
| `accept-invite-link.action.ts` | `accept_invite_link(token)` | `requireUser`; RPC валидирует токен, лимит участников, состояние trial |
| `decline-invite.action.ts` | (RPC) | только собственный membership |

**Хорошо:** trial-expired и лимит участников enforced *внутри* invite-RPC — read-only организация не может принимать новых участников.
**Утечка (P1):** `invite-member.action.ts:83` пишет **сырой email** приглашённого в `audit_logs.newData` (а `modules/settings/actions/invite-member.ts:51,60` — и в audit, и в domain_events). См. раздел PII.

---

## Текущая модель RLS и RPC

- RLS — основная граница изоляции тенантов; хелперы `is_org_member`, `is_org_admin`, `can_write_data`, `can_delete_data` (002) используются в политиках и RPC.
- **50 SECURITY DEFINER функций**; большинство поздних миграций задают явный `search_path = public, pg_catalog` (проверено в 086). Механический проход нашёл **`init_free_subscription` (012_saas_billing.sql:218) без явного `search_path`** — легаси, возможно неактивна (trial-путь теперь через `init_trial_subscription`), но всё равно пробел хардненинга. Полный проход по всем 50 функциям обязателен до подписания.
- **087/088** разделяют read-политику `domain_events` на классы business/personal/security/system и делают capture inbox owner-scoped — закрывая раннюю утечку «каждый участник читает весь поток событий org». Обе **применены** (088 подтверждена 2026-07-06).

---

## Карта мутаций

Репрезентативная выборка границ мутаций и их паттерна защиты (паттерн единообразен по ~139 Server Actions).

| Область | Файл | Экшен/RPC | Текущая защита | Отсутствует | Риск |
|---|---|---|---|---|---|
| Billing | `modules/billing/actions/change-plan.action.ts` | (без записи) | requireOrg + owner/admin; отклоняет trial + paid | — | Низкий |
| Members | `modules/members/actions/invite-member.action.ts` | `invite_member` RPC | owner/admin (UI) + RPC-перепроверка | сырой email → audit_logs | **P1 PII** |
| Members | `.../accept-invite.action.ts` | `accept_invite` RPC | requireUser; RPC привязан к auth.uid() | — | Низкий (клиентский org id валидируется) |
| Analytics | `modules/analytics/actions/create-snapshot.action.ts` | `analytics_snapshots.upsert` | requireOrg + admin; `organization_id = org.id` (сервер) | `workspace_id` от клиента не валидируется ∈ org | **P2** (проверить RLS `WITH CHECK`) |
| Settings | `modules/settings/actions/update-workspace.ts` | update | requireOrg | — | Низкий |
| Notifications | `modules/settings/notifications/actions/manage-push-subscription.ts` | `push_subscriptions.upsert/delete` | requireOrg; **service-role клиент** | RLS обойдён | **P1** (см. раздел service-role) |
| CRM (пауза) | `modules/crm/actions/create-client.action.ts` | insert + domain_event | requireOrg | сырой email → payload domain_event | **P1 PII** |
| Money | `modules/moneyflow/**` actions | RPC / insert | requireOrg + роль; денежные мутации требуют подтверждения | (выборочно; проверить каждый) | Низкий–P2 |
| Cron | `app/api/cron/*/route.ts` | service-role RPC | Bearer `CRON_SECRET`, fail-closed | — | Низкий |

> **Follow-up:** механически перечислить остальные ~130 экшенов и подтвердить, что каждый `insert/update/upsert/delete` выводит `organization_id` из `requireOrg` (не от клиента) и покрыт RLS `WITH CHECK`.

---

## Риски доверия к client payload

| Файл | Поле payload | Риск | Рекомендация |
|---|---|---|---|
| `modules/analytics/actions/create-snapshot.action.ts:23` | `workspaceId` (formData) | Снапшот можно пометить `workspace_id` чужой org; `organization_id` выводится на сервере, поэтому кросс-тенантного чтения нет, но риск целостности данных | Валидировать `workspace_id ∈ org` на сервере или обеспечить RLS `WITH CHECK`, что `workspace.organization_id = organization_id` |
| `modules/members/actions/accept-invite.action.ts:28` / `decline-invite.action.ts:20` | `organizationId` (formData) | Низкий — RPC (`accept_invite`) резолвит membership по `auth.uid()`; неверный/чужой org id просто фейлится | Оставить; привязка в RPC — реальный guard |
| `modules/settings/actions/update-workspace.ts:20-21` | `organizationName`, `workspaceName` | Только контент, не id — нет риска тенантности | — |

**Общее:** ни одна из выборочных мутаций не берёт `organization_id` от клиента для *области записи*; все выводят его из `requireOrg`. Хорошая база.

---

## Использование Service Role

`lib/supabase/service-role.ts` → `getServiceRoleClient()` (возвращает `null`, если не сконфигурирован; fail-safe). Точки вызова:

| Файл | Использование | Легитимно? | Риск | Рекомендация |
|---|---|---|---|---|
| `lib/rate-limit/rate-limit.ts:61` | write-RPC в таблицу rate-limit (authenticated не может) | ✓ инфра, fail-open | Низкий | — |
| `app/api/cron/*` → `consume-expired-trials.ts`, `sweep-subscription-payment-workflow.ts`, `expire-stale-suggestions.ts`, `extraction-worker.ts`, `process-reminders.ts`, `notification-delivery.ts` | кросс-org cron-sweep | ✓ установленный cron-паттерн (не запускается пользователем) | Низкий | — |
| **`modules/settings/notifications/actions/manage-push-subscription.ts:12,31`** | **запускаемые пользователем `"use server"` экшены** upsert/delete `push_subscriptions` через service role | **✗ нарушает «нет service role в запускаемой пользователем логике»** | **P1** — RLS обойдён; записи ограничены `user_id`/`org_id` из контекста, поэтому не кросс-тенантные, но нет слоя защиты RLS | Убрать `push_subscriptions` под RLS (`user_id = auth.uid()`) и использовать authenticated-клиент, **либо** `SECURITY DEFINER` RPC с привязкой к `auth.uid()` |

---

## Риски утечки сырого Email / PII

Принцип: *никакого сырого email в billing_trial_claims, security_events, audit logs, domain_events или логах приложения.*

| Файл/Таблица | Поле | Риск | Рекомендация |
|---|---|---|---|
| `modules/members/actions/invite-member.action.ts:83` → `audit_logs.new_data` | `email` | Сырой email приглашённого в audit-таблице | Хранить `normalized_email_hash` или редактированную/маскированную форму; сырой email — только в `auth.users` / транзакционной отправке письма |
| `modules/settings/actions/invite-member.ts:51,60` → `audit_logs` + `domain_events` | `email` | То же, в обоих потоках audit и event | То же |
| `modules/crm/actions/create-client.action.ts:73` → `domain_event.payload` | `email` | CRM — бизнес-данные (спорно, «биллинговый PII» ли), но email клиента в долговечном потоке событий — всё равно PII в audit-приёмнике | Убрать email из payload события (хранить в строке `crm_clients` под RLS) или хешировать |
| `billing_trial_claims` (086) | — | ✓ **нет сырого email** (только `normalized_email_hash`) | оставить; апгрейд хеша до HMAC (ниже) |
| Логгер приложения (`lib/observability/logger`) | — | Выборочные вызовы логов используют scoped-ключи, не сырой email | Добавить lint/редакцию-guard, чтобы так и оставалось |

---

## Риски злоупотребления Trial

| Сценарий | Защищено? | Пробел | Рекомендация |
|---|---|---|---|
| Вторая org → второй trial | ✅ `UNIQUE(user_id)` + `UNIQUE(normalized_email_hash)`; повторная org получает `expired`/read-only | — | — |
| Удалить org и создать заново | ✅ claim переживает org (`organization_id ON DELETE SET NULL`) | — | — |
| Реактивация истёкшего/отменённого trial через dashboard | ✅ `changePlanAction` отклоняет `trial` и все платные планы | — | — |
| Тот же email, новый auth-user | ✅ `check_trial_eligibility` проверяет `normalized_email_hash` | — | — |
| **Перечисление / предвычисление email-хеша** | ⚠️ Частично | **Несолёный `sha256`** — атакующий с доступом к таблице может rainbow-table по email; и нельзя ротировать | **Фаза 1: HMAC-SHA256 над канонич. email с серверным pepper** (документировано в 086 как отложенное) |
| Гонка двойного claim | ✅ unique-констрейнты + `INSERT ... EXCEPTION unique_violation` в `init_trial_subscription` | — | Добавить явный race-тест |
| Злоупотребление plus-alias (`a+x@`) | Не срезается (по дизайну — соответствует «не срезать без политики») | — | Оставить, если продукт не решит иначе |

---

## Риски злоупотребления инвайтами

| Сценарий | Защищено? | Пробел | Рекомендация |
|---|---|---|---|
| Не-админ приглашает участника | ✅ UI-guard + `invite_member` RPC перепроверяет admin | — | — |
| Инвайт сверх лимита мест плана | ✅ `checkPlanLimit` + RPC `member_limit_reached` | — | — |
| Принять инвайт в read-only/истёкшую-trial org | ✅ RPC возвращает `trial_expired` | — | — |
| Принять чужой инвайт | ✅ RPC привязывает membership к `auth.uid()` | — | — |
| Брутфорс/срок токена invite-ссылки | Предположительно обработано в `create_invite_link`/`accept_invite_link` (непрозрачный токен) — **в этом проходе не читалось полностью** | ⚠️ проверить энтропию токена + срок + одноразовость | Подтвердить, что токен высокоэнтропийный, истекающий и отзываемый в миграции инвайтов |
| Сырой email в audit-следе инвайта | ❌ | Утечка (см. таблицу PII) | Хешировать/редактировать |

---

## Пробелы RLS

| Таблица | Read-политика | Write-политика | WITH CHECK | Пробел |
|---|---|---|---|---|
| `billing_trial_claims` | own-or-admin | нет (только SECURITY DEFINER) | н/д | ✅ корректно |
| `domain_events` | class-split (087/088) | member insert | — | ✅ 087+088 применены (088 подтверждена 2026-07-06) |
| `push_subscriptions` | (обойдено — service role) | (обойдено) | — | **P1** — нет пути RLS через authenticated-клиент; см. фикс service-role |
| `analytics_snapshots` | (предположительно org-scoped) | upsert с серверным `org_id` | **не проверено для `workspace_id`** | **P2** — подтвердить, что `WITH CHECK` связывает `workspace_id` с org |
| ~все прочие тенант-таблицы | семейство is_org_member | can_write/can_delete | в основном есть | **Follow-up: нужна механическая перечисление `WITH CHECK`** |

---

## Покрытие тестами

Есть (выборочно):
- `modules/billing/services/trial-eligibility.test.ts` — парсинг eligibility (fail-closed).
- `lib/billing/account-limits.test.ts`, `lib/auth/resolve-active-organization.test.ts`, `lib/context/current-context.test.ts`.
- `modules/*/services/*.test.ts` для service-role sweep (extraction, suggestions) — проверяют безопасный пропуск при null-service.
- DB-верификация: `supabase/tests/trial_reuse_verification*.sql`, `data_isolation_visibility_verification.sql`.

Отсутствует / рекомендуется:
- **Тест конкурентности** для `init_trial_subscription` (два одновременных claim → ровно один).
- **Тест DB-констрейнта**, утверждающий, что колонки с сырым email никогда нет в billing/security-таблицах.
- **Тест обхода RLS** для `push_subscriptions` после фикса service-role.
- **Негативные тесты `WITH CHECK`**, доказывающие, что участник не может записать строку чужой org через прямой Supabase API.

---

## P0-фиксы

Не выявлено в исследованной поверхности. (Оговорка: полный проход `WITH CHECK` по таблицам и ревью миграции invite-токена в этот раз не завершены — любой из них может вскрыть P0.)

## P1-фиксы

> **Статус: все P1 закрыты (2026-07-06).**

1. ~~**Убрать service role из push-экшенов**~~ — ✅ **сделано**. `manage-push-subscription.ts` теперь ходит через RLS-scoped authenticated-клиент; у `push_subscriptions` уже были owner-scoped политики (073), так что схему менять не пришлось.
2. ~~**Прекратить писать сырой email в `audit_logs` / `domain_events`**~~ — ✅ **сделано**. Новый утиль `maskEmail()` (`lib/email/mask-email.ts`, покрыт тестами) маскирует local-part; применён во всех трёх местах (members invite, settings invite, CRM create-client).
3. ~~**Апгрейд trial-идентичности до HMAC-SHA256 + pepper**~~ — ✅ **сделано** в Фазе 1 (миграция 089, применена 2026-07-06).
4. ~~**Проход по `search_path` всех SECURITY DEFINER функций**~~ — ✅ **сделано** (Приложение A: 91 функция, все с явным `search_path`; `init_free_subscription` захардненена в миграции 090).
5. ~~**Применить миграцию 088**~~ — ✅ **сделано** (применена на remote, подтверждено 2026-07-06).
6. ~~**Гонка single-use инвайта** (Low, Приложение C)~~ — ✅ **сделано**. `accept_invite_link` теперь row-lock (`FOR UPDATE`) в миграции 090 → токен строго одноразовый.

Remediation в **миграции 090** (`init_free_subscription` search_path +
`accept_invite_link` `FOR UPDATE`) + app-изменения выше. **Миграции 088, 089 и
090 применены на remote (090 подтверждена 2026-07-06).** Открытых P1/Low не
осталось — всё закрыто и в коде, и на remote.

## P1 → follow-up (верификация, не код)

6. **Подтвердить invite-токен** — энтропия, срок, одноразовость.
7. **Подтвердить RLS `WITH CHECK` для `analytics_snapshots`** — связывает ли `workspace_id` с `organization_id`.
8. **Механическое перечисление** всех ~130 оставшихся Server Actions на предмет доверия к клиентскому `organization_id` и покрытия RLS `WITH CHECK`.

---

## Итоговая рекомендация

Фундамент безопасности **прочный и единообразный**: тенантность выводится на сервере, авторизация enforced через RPC, защита от повторного trial на уровне БД и честная позиция биллинга, отказывающегося активировать платные/trial-планы из браузера. **Свидетельств живого кросс-тенантного P0** в проверенных путях нет.

Переходите к **Фазе 1** с уточнённой областью: наивысший приоритет — **хардненинг trial-идентичности до HMAC-SHA256 с серверным pepper** (уже задокументированная цель Фазы 1). Параллельно закрыть три дешёвых P1 — service role в push-экшенах, сырой email в audit/event-приёмниках и проход по `search_path`. (Миграция 088 уже применена.) Перед публичным запуском завершить два отложенных прохода верификации (семантика invite-токена и полное перечисление RLS `WITH CHECK`), поскольку дефект там — единственное место, где ещё может прятаться P0.

---

# Приложение — Исчерпывающие проходы (закрывают DoD Фазы 0)

> Добавлено после первичного выборочного прохода. Три механических прохода
> закрывают пункты DoD, ранее покрытые выборочно. Метод: скриптовые сканы по
> `supabase/migrations/*.sql` и всем `"use server"` файлам + ручная
> классификация каждого исключения. **Итог по находкам: вывод по P0 не меняется
> (P0 нет). Одна прежняя P1 понижена (dormant), добавлена одна новая Low
> (гонка single-use инвайта).**

## Приложение A — `search_path` у всех SECURITY DEFINER функций

Скан берёт **последнее** определение каждой функции (`CREATE OR REPLACE`).

- **91** SECURITY DEFINER функция (текущие определения).
- **90** задают явный `SET search_path`. ✅
- **1** не задаёт: **`init_free_subscription(uuid)`** (`012_saas_billing.sql`).

`init_free_subscription` — **dormant / недостижима**: единственная ссылка — это
deprecated no-op `initSubscriptionAction` (ничего не выдаёт), функция
internal-only (гранты отозваны в 035), ни SQL, ни app-код её не вызывают.
**Понижение** с прежней P1 до *латентной гигиены* — не эксплуатируется.
Рекомендация: добавить `SET search_path` (или `DROP FUNCTION`) в будущей
миграции для полноты.

## Приложение B — Авторизация всех Server Actions

**139** `"use server"` файлов. Распределение guard (прямые):

| Guard | Кол-во |
|---|---|
| `requireOrg` (вкл. комбинации `+requireUser` / `+perm`) | 111 |
| только `requireUser` (уместно для auth-контекста) | 6 |
| Нет **прямого** guard-токена | 22 |

Все **22** файла «без прямого guard» классифицированы поимённо — **ни один не
является незащищённой пользовательской мутацией**:

| Группа | Файлы | Почему безопасно |
|---|---|---|
| Auth-эндпоинты | `login` / `register` / `logout` | устанавливают сессию; guard был бы циклическим |
| Locale cookie | `shared/i18n/set-locale.action.ts` | ставит cookie, без tenant-данных |
| Settings-экшены (8) | `invite-member`, `update-member-role`, `remove-member`, `update-workspace`, `update-profile`, `update-avatar`, `remove-avatar`, `create-billing-portal-session` | защищены `authorizeSettingsAction` → `requireOrg` + owner/admin |
| Делегирующие обёртки | `ai/actions.ts`, `action-center/get-feed` & `get-action-detail`, `relations/delete-relation` & `search-relation-candidates` | авторизация в делегате (`requireOrg`) |
| Внутренняя инфраструктура | `lib/events/emit-audit-log.ts`, `automation/logs/create-automation-log.ts`, `automation/engine/dispatch-domain-event.ts` | вызываются только внутри защищённых потоков; org id из серверного контекста |
| Не-экшен | `relations/relation.schema.ts` (`"use server"` в комментарии — ложное срабатывание), `*.query.test.ts` (тест) | не runtime-экшен |

**Клиентский `organization_id` / `workspace_id`** (4 совпадения): `accept-invite`
и `decline-invite` (RPC привязан к `auth.uid()` — валидируется), `dispatch-domain-event`
(внутренний; org id от серверного эмиттера) и `create-snapshot` (`workspaceId` —
уже зафиксированная **P2**). Новых рисков доверия нет.

**Вывод:** 139/139 экшенов имеют серверную авторизацию (прямо или делегированием);
незащищённых пользовательских мутаций нет.

## Приложение C — Семантика invite-токена

Источник: `026_invite_links.sql` + seat-триггер `076`.

| Свойство | Находка | Вердикт |
|---|---|---|
| **Энтропия** | токен = два `gen_random_uuid()` (64 hex), CSPRNG → ~244 бит | ✅ перебор невозможен |
| **Срок** | `expires_at NOT NULL DEFAULT now()+7 дней`; проверяется в `accept_invite_link` и `get_invite_info` | ✅ |
| **Одноразовость** | `status` меняется `pending → accepted`; повтор отклоняется | ✅ (с оговоркой) |
| **Публичное чтение** | `get_invite_info` читаем anon по дизайну (страница `/invite/<token>` до логина). Безопасно при данной энтропии | ✅ |
| **Лимит мест под гонкой** | подсчёт мест в `accept_invite_link` не атомарен, **но** триггер `076` `enforce_member_seat_limit` сериализует per-org через `pg_advisory_xact_lock` — параллельные accept не превысят `max_members` | ✅ |

**Находка Low — ✅ ЗАКРЫТА (миграция 090, 2026-07-06):** `SELECT` статуса в
`accept_invite_link` был без `FOR UPDATE` — два параллельных accept одного токена
могли оба пройти проверку `status='pending'` и добавить по membership. Влияние было
ограничено: триггер 076 гарантирует непревышение `max_members`, оба вступления — в
правильный tenant. Миграция 090 добавляет `FOR UPDATE` → второй параллельный accept
блокируется, затем видит `status='accepted'` и отклоняется. Строго одна акцептация
на ссылку. _(Исходная рекомендация — добавить `FOR UPDATE` в select статуса или per-token
advisory lock — реализована.)_

## Приложение — Статус DoD

| Отложенный пункт DoD | Статус |
|---|---|
| Все write-экшены отмаплены | ✅ Приложение B (139/139) |
| Все SECURITY DEFINER функции + `search_path` | ✅ Приложение A (91, одно dormant-исключение) |
| Invite-токен: энтропия / срок / одноразовость | ✅ Приложение C |

**Фаза 0 теперь завершена.** Вывод по P0 не изменился. Обновление реестра
находок: `init_free_subscription` `search_path` → *латентная гигиена (dormant)*;
гонка single-use инвайта → *новая Low*. **Все P1 и Low из этого аудита закрыты в
коде** (см. раздел «P1-фиксы») — service role убран из push-экшенов, email
замаскирован в audit/event, `search_path` захардненен, инвайт строго одноразовый.
**Миграции 088, 089 и 090 применены на remote (090 подтверждена 2026-07-06).**
