# Automation Foundation (Phase 1)

Фундамент для автоматизации бизнес-процессов между модулями Nevora Business OS.

```
User Action → Domain Event → Automation Engine → Cross-Module Actions → Audit Log
```

Цель Phase 1 — **инфраструктура**, а не готовые автоматизации. AI-рекомендации,
визуальный workflow-builder, очереди и user-configurable правила — вне scope.

---

## Слои

| Слой | Где | Назначение |
|---|---|---|
| `domain_events` (таблица) | миграция `006` | append-only журнал бизнес-событий |
| `emitDomainEvent()` | `lib/events/` | записать событие + запустить dispatch |
| `entity_links` (таблица) | миграция `040` | кросс-модульные связи сущностей |
| Entity Linking service | `lib/entity-links/` | create/get/delete связей |
| `automation_audit_logs` (таблица) | миграция `040` | журнал выполнения автоматизаций |
| Automation Engine | `modules/automation/` | registry + dispatch + handlers |

> `automation_audit_logs` ≠ `audit_logs`. `audit_logs` (006) — «пользователь
> изменил запись». `automation_audit_logs` — «автоматизация отработала/упала».

---

## Что такое domain event

Факт состоявшегося бизнес-действия (`task.created`, `money.transaction.created`).
Append-only: только INSERT, без UPDATE/DELETE (RLS deny by default).
Полный список имён и типы payload — в `lib/events/domain-event.types.ts`.

## Как опубликовать domain event

Только **после** успешной бизнес-операции, внутри Server Action:

```ts
import { emitDomainEvent } from "@/lib/events";

const { data: tx } = await supabase
  .from("money_transactions")
  .insert({ /* ... */ })
  .select("id")
  .single();

await emitDomainEvent({
  organizationId: org.id,          // ВСЕГДА из серверного контекста, не с клиента
  workspaceId: workspace.id,
  eventName: "money.transaction.created",
  aggregateType: "transaction",
  aggregateId: tx.id,
  payload: { amount, type, currency },
});
```

`emitDomainEvent` сам вызовет `dispatchDomainEvent` — отдельно дёргать движок не нужно.
Ошибка записи события или автоматизации **не откатывает** основную операцию.

## Как создать entity link

```ts
import { createEntityLink } from "@/lib/entity-links";

const res = await createEntityLink({
  sourceType: "document",
  sourceId: doc.id,
  targetType: "transaction",
  targetId: tx.id,
  linkType: "generated_from",
});
if (!res.ok) { /* res.error */ }
```

- `organization_id` берётся из `requireOrg()` — cross-tenant связь невозможна.
- self-link и дубликаты отклоняются (Zod + unique-индекс).
- `link_type` ∈ `related | generated_from | attached_to | paid_by | renewed_by | requires_action | belongs_to`.

Чтение — `getEntityLinks({ source } | { target })`, удаление — `deleteEntityLink({ id })`.

## Как работает dispatch

```
emitDomainEvent()
  → INSERT domain_events (RPC emit_domain_event) → eventId
  → dispatchDomainEvent({ eventId, eventName, ... })
      → getHandlersForEvent(eventName)        // registry
      → для каждого хендлера: try { run() } catch { failed }
      → createAutomationLog(status, ...)      // на каждый запуск
```

Ключевая гарантия — **изоляция**: исключение в одном хендлере ловится,
пишется `status='failed'` + `error_message`, остальные хендлеры и исходное
действие пользователя не страдают.

## Как работают automation logs

Каждый запуск хендлера = строка в `automation_audit_logs` со статусом
`executed | failed | skipped` (`created` зарезервирован под async-очереди).
Связь с породившим событием — через `trigger_event_id → domain_events.id`.
Чтение: `getAutomationLogs({ status?, triggerEventId?, limit? })` (permission `automation.read`).

## Как добавить новый automation handler

1. Создай `modules/automation/handlers/on-<event>.ts`:

```ts
import type { AutomationHandler } from "../engine/automation-handler.types";

export const onDealWon: AutomationHandler = {
  name: "on-deal-won",
  eventName: "deal.won",
  async run(ctx) {
    // побочный эффект под RLS от имени пользователя (createEntityLink и т.п.)
    return { status: "executed", output: { /* ... */ } };
    // либо: return { status: "skipped", output: { reason } };
  },
};
```

2. Зарегистрируй в `modules/automation/engine/automation-registry.ts`
   (импорт + добавить в `AUTOMATION_HANDLERS`).
3. Убедись, что соответствующий `eventName` есть в `DomainEventName`.

---

## Security rules

- `organization_id` — только из серверного контекста (`requireOrg()`), никогда из client payload.
- Конвейер мутации: auth → resolve org → Zod → permission (`canDo`) → RLS-insert → событие.
- Все INSERT/UPDATE-политики — с `WITH CHECK`; `created_by = auth.uid()` форсируется политикой.
- Логи (`domain_events`, `automation_audit_logs`) immutable: без UPDATE/DELETE.
- Хендлеры работают под RLS от имени пользователя. **Service role в app-логике не используется.**
- Никаких `select("*")` и raw SQL-интерполяции.

### Permissions (роль-производные, `lib/auth/require-org.ts`)

| Permission | member | manager | admin | owner |
|---|:--:|:--:|:--:|:--:|
| `domain_event.read` | ✅ | ✅ | ✅ | ✅ |
| `entity_link.read` / `entity_link.create` | ✅ | ✅ | ✅ | ✅ |
| `entity_link.delete` | — | ✅ | ✅ | ✅ |
| `automation.read` | ✅ | ✅ | ✅ | ✅ |
| `automation.manage` | — | — | ✅ | ✅ |

---

## Примеры событий → автоматизаций (Phase 1)

| Событие | Хендлер | Действие |
|---|---|---|
| `document.created` | `on-document-created` | при `linked_entity_*` в payload → link document `generated_from` сущность |
| `money.transaction.created` | `on-transaction-created` | при `subscription_id` → link transaction `paid_by` subscription. Срабатывает при создании подписки (авто-`planned`-транзакция) и при ручном выборе подписки в форме транзакции. См. [money-upcoming-expenses.md](money-upcoming-expenses.md) |
| `task.created` | `on-task-created` | integration point (skipped) |
| `subscription.renewed` | `on-subscription-renewed` | integration point (skipped) |

---

## Тесты

- `lib/entity-links/entity-link.schema.test.ts` — валидация связей (self-link, дубли, UUID, link_type).
- `lib/events/domain-event.schema.test.ts` — allowlist событий и ограничение payload.
- `modules/automation/engine/dispatch-domain-event.test.ts` — изоляция падающего хендлера, логирование, missing handlers.

### Testing plan (требует БД-харнесса — следующий шаг)

Проектная тест-инфраструктура — vitest/node без БД, поэтому интеграционные
и security-сценарии описаны как план для будущего Supabase-харнесса:

- **Integration:** после `createTaskAction` в `domain_events` есть `task.created`;
  после `createTransactionAction` — `transaction.created`; `automation_audit_logs`
  заполняется после dispatch; падающий хендлер пишет `failed`.
- **Security (RLS):** юзер org A не видит `domain_events`/`entity_links`/
  `automation_audit_logs` org B; нельзя создать cross-tenant `entity_link`;
  нельзя UPDATE/DELETE `domain_events` и `automation_audit_logs`.
  Проверяется SQL под двумя JWT (две org) против `pg_policies`.
