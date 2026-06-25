# Money: Предстоящие расходы (planned-транзакции)

Прогноз будущих списаний на дашборде `dashboard/money` для «учёта средств».
Опирается на статус транзакции `posted | planned` (миграция `041`).

```
Подписка / ручной план
  → planned-транзакция (в баланс НЕ входит)
  → «Предстоящие расходы» + «Прогноз баланса»
  → «Провести» (planned → posted)
  → факт: Recent Transactions + Balance / Monthly Expenses
```

---

## Статус транзакции

`money_transactions.status` (миграция [041](../supabase/migrations/041_transaction_status.sql)):

| Статус | Смысл | Влияет на баланс | Где видно |
|---|---|---|---|
| `posted` | фактическая (default) | **да** | Recent Transactions |
| `planned` | запланированный расход | **нет** (до проведения) | секция «Запланированные» + прогноз |

Все существующие строки при миграции получили `posted` → поведение не изменилось.
Частичный индекс `money_transactions_planned_idx` обслуживает выборку планов.

## Что считается фактом

Только `posted`. Это форсируется в трёх местах:

- [get-money-summary.ts](../modules/moneyflow/queries/get-money-summary.ts) — Balance и Monthly Expenses по `status='posted'`.
- RPC `get_org_money_summary` (патч в `041`) — то же на уровне БД.
- [get-transactions.ts](../modules/moneyflow/queries/get-transactions.ts) — Recent Transactions показывает только `posted`.

Планы исключены из факта → они не «протекают» в баланс и не дублируются.

## Прогноз «Предстоящие расходы»

[get-upcoming-expenses.ts](../modules/moneyflow/queries/get-upcoming-expenses.ts) суммирует
`planned`-расходы (`type='expense'`) в окне **сегодня … конец текущего месяца**:

```ts
const { total, plannedCount } = await getUpcomingExpenses();
```

Подписки **не** суммируются отдельно: при создании подписки автоматически
заводится `planned`-транзакция на `next_billing_date` (см. ниже), поэтому она
уже учтена в плановых транзакциях — двойного учёта нет.

Валюты суммируются «наивно» (как и `getMoneySummary`) — мультивалютная
нормализация вне текущей итерации.

## UI

[money-summary-cards.tsx](../modules/moneyflow/components/money-summary-cards.tsx) —
при переданном `upcoming` добавляется 4-я карточка:

- **Предстоящие расходы** = `total`;
- **Прогноз баланса** = `balance − total` (строкой под значением).

Карточка показывается только на money-странице (дашборд передаёт `summary` без `upcoming`).

[planned-transactions.tsx](../modules/moneyflow/components/planned-transactions.tsx) —
секция «Запланированные» (между счетами и Recent), рендерится при наличии планов.
Каждая строка: бейдж, сумма, дата · счёт, кнопки **«Провести»** и **«Удалить»**.

## Создание planned-транзакции

1. **Вручную:** форма транзакции → поле «Тип записи» → *Запланированная*
   ([create-transaction-form.tsx](../modules/moneyflow/components/create-transaction-form.tsx),
   статус в [transaction.schema.ts](../modules/moneyflow/schemas/transaction.schema.ts)).
2. **Из подписки:** при создании подписки
   ([create-subscription.action.ts](../modules/subtracker/actions/create-subscription.action.ts))
   заводится `planned`-транзакция-расход на `next_billing_date` с выбранного счёта
   и связь `entity_link` `transaction --paid_by--> subscription` (через
   `transaction.created` → `on-transaction-created`).

## Проведение (planned → posted)

[post-planned-transaction.action.ts](../modules/moneyflow/actions/post-planned-transaction.action.ts):

- `requireOrg` + `canDo('data.write')` + UUID-валидация;
- `update status='posted'` с фильтром `organization_id` + `status='planned'`
  → провести можно только свою ещё не проведённую транзакцию (идемпотентно,
  cross-tenant невозможно, RLS дублирует проверку);
- эмитит `transaction.updated`.

После проведения транзакция уходит из прогноза и попадает в Balance / Monthly /
Recent.

## Security

- `organization_id` — только из серверного контекста, не с клиента.
- `account_id` авто-транзакции проверяется RLS (`EXISTS`) — чужой счёт БД отклонит.
- Сбой авто-транзакции не откатывает уже созданную подписку (логируется).
- Без счёта подписку создать нельзя (`account_id` required + кнопка заблокирована).

## Acceptance

1. Создать транзакцию с типом *Запланированная* → не в Recent, не в Balance;
   видна в «Запланированные» и в карточке «Предстоящие расходы».
2. «Провести» → уходит из планов, появляется в Recent, меняет Balance/Monthly.
3. Создать подписку → `planned`-транзакция на `next_billing_date` (если в текущем
   месяце — попадает в «Предстоящие»), связь `paid_by` в `entity_links`.

```sql
select status, count(*) from money_transactions group by status;
select source_type, target_type, link_type from entity_links where link_type='paid_by';
```
