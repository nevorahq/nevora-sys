# Промпт: Phase 3 — proof, then people

**Назначение:** провести Phase 3 плана бета-запуска — доказать, что основной цикл
работает на задеплоенном окружении, и узнать, нужен ли он живым людям.
**Составлен:** 2026-07-10, против `main` @ `5061ab4`.
**План:** [`../project-workflows-and-beta-plan-2026-07-10.md`](../project-workflows-and-beta-plan-2026-07-10.md),
раздел `## Plan` → `### Phase 3`, и `## Product Proof`.

---

## Что это и почему это НЕ хендофф агенту

Phase 1 отдавалась агенту целиком, потому что жила в репозитории. Phase 3 —
противоположность: **её смысл в том, что её проходит человек.** Агент не может ни
«пройти» интерактивный smoke на живом окружении, ни быть одним из пяти
пользователей. Поэтому это не задача для делегирования, а **операторский
runbook** для релиз-владельца. Единственный делегируемый срез — подготовка
(шаблон доказательств, SQL-пак, проверка видимости в Sentry) — вынесен в конец.

Phase 3 — фаза, ради которой существовали предыдущие три. **Она может отменить
Phase 4-5:** если продукт не проходят живые люди, автоматизация и платный флоу
преждевременны.

---

## Предусловия (blockers — без них Phase 3 недействителен)

1. **Задеплоенное окружение**, не `localhost`, доступно и авторизуемо. I-09
   определён именно против «deployed authed environment» (см.
   `docs/release/p0-p1-issue-register.md` I-09).
2. **Sentry живой на этом окружении.** `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN`
   заданы в env проекта на Netlify (хвост Phase 2 — в `.env.local` их недостаточно).
   Без этого `diagnosticId` из evidence не с чем коррелировать. Проверка: любой
   тестовый throw должен появиться в Sentry с тегом `event` и совпасть по
   `diagnosticId`/`digest` со структурной лог-строкой.
3. **Тестовые данные** (как в `docs/release/smoke-test-checklist.md`, «Set up»):
   одна org с ≥1 подпиской, ≥1 документом, ≥1 просроченной задачей; и **вторая org
   другого владельца** — для isolation-проверок.
4. **Доступ к remote БД** для SQL-выборок (service-role key, SELECT достаточно —
   см. `db-apply-and-diagnostics` в памяти проекта).

---

## Часть A — I-09: ручной интерактивный smoke (один раз, на задеплое)

**Источник сценариев — канонический `docs/release/smoke-test-checklist.md`.** Не
переписывать и не сокращать его. Пройти целиком, с приоритетом ⚑-пунктов (это
release blockers). Phase 3 добавляет к нему **evidence contract** — без evidence
пункт не считается закрытым.

Минимальный набор сценариев (все есть в чеклисте; здесь — как индекс):

- `register → onboarding → org → dashboard`;
- `upload → extract → review → confirm transaction`;
- `reject document suggestion`;
- `mark financial task paid` — **дважды** (double-click, потом refresh и ещё раз);
- `mark subscription cycle paid` — **дважды**;
- `cross-org direct-ID access` (safe not-found, не 500, не чужая строка);
- `notification read ≠ resolve`;
- `Capture Inbox accept/reject`.

### Evidence contract (на КАЖДЫЙ сценарий)

1. **Запись экрана** либо **скриншот конечного состояния**.
2. **`diagnosticId`** любой возникшей ошибки — и подтверждение, что она видна в
   Sentry (лог ↔ Sentry корреляция).
3. Для денежных сценариев — **SQL-выборка**, доказывающая инвариант (ниже).

### SQL-пак для денежных инвариантов (против remote)

Заменить `:org_id`, `:task_id`, `:subscription_id`, `:period_key` фактическими
значениями из прогона. Ожидаемый результат подписан под каждым запросом.

**A1. Financial task — двойной клик даёт ровно одну транзакцию.**
Гард — единственная колонка `todos.financial_transaction_id` (non-null == paid).

```sql
select t.id                       as task_id,
       t.financial_status,                       -- expect: 'paid'
       t.financial_transaction_id,               -- expect: NOT NULL
       (select count(*) from money_transactions m
          where m.id = t.financial_transaction_id) as linked_tx_count  -- expect: 1
from todos t
where t.id = :task_id;
```

**A2. Subscription cycle — двойной клик даёт ровно один цикл и одну транзакцию.**
Гард — `UNIQUE (organization_id, subscription_id, billing_period_key)` +
`transaction_id`.

```sql
select c.subscription_id,
       c.billing_period_key,
       c.status,                                 -- expect: 'paid'
       c.transaction_id,                         -- expect: NOT NULL
       (select count(*) from subscription_payment_cycles c2
          where c2.organization_id  = c.organization_id
            and c2.subscription_id  = c.subscription_id
            and c2.billing_period_key = c.billing_period_key) as cycles_for_period, -- expect: 1
       (select count(*) from money_transactions m
          where m.id = c.transaction_id)          as linked_tx_count   -- expect: 1
from subscription_payment_cycles c
where c.subscription_id = :subscription_id
  and c.billing_period_key = :period_key;
```

**A3. Task complete — обычная задача НЕ создаёт денежную транзакцию.**
Снять счётчик до и после завершения не-финансовой задачи; дельта = 0.

```sql
select count(*) as tx_count
from money_transactions
where organization_id = :org_id;
-- До завершения и после — одно и то же число. Дельта строго 0.
```

> Если хоть один инвариант нарушен — это **P0**, Phase 3 останавливается, баг
> чинится до продолжения. Денежный дубль — не «баг из списка», а инцидент.

---

## Часть B — пять живых пользователей (Product Proof)

Материал — раздел `## Product Proof` плана. Это **пункт 2 Phase 3**, и следующая
продуктовая веха — не ещё один модуль, а пять человек, прошедших таблицу ниже на
**своих реальных данных**.

| User proof | Success signal | Что доказывает |
|---|---|---|
| Загрузить реальный чек/инвойс | Пользователь подтверждает или отклоняет suggestion | Document workflow + доверие. |
| Добавить реальную подписку | Видит следующее платёжное действие | Модель повторяющихся обязательств. |
| Отметить реальный платёж оплаченным | Один расход, без дубля | Confirm-first денежный цикл. |
| Записать «грязную» заметку | Принимает AI-suggestion | Inbox как естественный вход. |
| Открыть Action Center на следующий день | Понимает, что делать | Обещание продукта. |

### Протокол

- **Без подсказок.** Наблюдающий не ведёт за руку. Фиксируется, где пользователь
  застрял, что переспросил, где ушёл не туда.
- На каждого пользователя: прошёл/не прошёл по каждой из 5 строк + короткая
  заметка «что сломало поток» (onboarding, copy, неясность workflow).
- Данные — **реальные пользователя**, не тестовая org оператора.

### Правило остановки (из плана, дословно по смыслу)

> Если **меньше трёх из пяти** проходят это **без подсказок** — **остановить
> разработку фич** и чинить onboarding / copy / ясность workflow. **Phase 4 и
> Phase 5 не начинаются.**

Это не метрика для галочки. Это единственный триггер, который может развернуть
дорожную карту. Осознанный компромисс плана: пять пользователей идут по коду, ещё
не покрытому Playwright, — потому что их фидбэк может отменить эту работу.

---

## Делегируемый срез (что МОЖЕТ подготовить агент)

Не сам прогон, а обвязка вокруг него:

1. **Шаблон доказательств** — таблица «сценарий → запись/скриншот → diagnosticId →
   SQL-результат», по одному разделу на I-09-сценарий, готовая к заполнению.
2. **SQL-пак как исполняемый скрипт** — запросы A1–A3 в один `.sql`, параметры
   вверху; чтобы оператор подставил id и прогнал одной командой.
3. **Проверка видимости в Sentry** — короткий скрипт/чек, что `diagnosticId` из
   ошибки реально долетает (аналог smoke из Phase 2).
4. **Свод результатов** — после прогона собрать evidence в
   `docs/release/phase-3-proof-report-<дата>.md` и обновить статус в плане.

Скажи, если нужно — сгенерирую (1)–(3) заранее.

---

## Определение готовности Phase 3 (exit criteria)

Phase 3 закрыта, когда **оба** выполнено:

- **I-09** пройден один раз на задеплое, у каждого сценария есть evidence по
  контракту, все три денежных инварианта (A1–A3) держатся; I-09 в
  `p0-p1-issue-register.md` переведён `OPEN → закрыт с доказательством`.
- **≥3 из 5** живых пользователей прошли таблицу Product Proof без подсказок.

Если пользователи не прошли — Phase 3 **не** закрыта, и это правильный, а не
плохой исход: он экономит Phase 4-5. Следующий шаг тогда — не код, а
onboarding/copy/workflow.

## Куда класть доказательства

- Отчёт прогона: `docs/release/phase-3-proof-report-<дата>.md` (по образцу
  существующих `docs/release/smoke-test-report-2026-07-09*.md`).
- Обновить: `p0-p1-issue-register.md` (I-09), и секцию `### Phase 3` +
  таблицу «Готовность» в плане.
