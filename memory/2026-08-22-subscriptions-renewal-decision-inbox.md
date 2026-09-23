# Subscriptions: Renewal Decision Inbox

Generated: 2026-08-22  
Status: DRAFT — requires product approval  
Mode: Startup / MVP  
Selected direction: Approach A — Renewal Queue

## 1. Executive decision

The primary job of Subscriptions is not to catalogue recurring payments. It is to make sure the user decides what to do with every meaningful renewal before the decision deadline.

The MVP turns `/subscriptions` into a decision inbox with one recurring question:

> What should happen with this subscription before it renews?

The four supported answers are:

1. Keep it.
2. Review it.
3. Do not renew it.
4. Remind me later.

Gmail invoices remain supporting evidence inside this workflow. Payment confirmation remains a separate workflow. The product must never imply that it cancelled a vendor subscription or posted a financial transaction when it only recorded a decision.

## 2. Problem statement

People and small teams do not usually lose money because they cannot list their subscriptions. They lose control because:

- the renewal date is forgotten;
- the last useful cancellation date is unclear;
- the invoice and commercial context are scattered across email and documents;
- deciding, cancelling, and confirming payment are treated as the same action;
- reminders arrive without a clear next action.

The product hypothesis is that a narrow, decision-oriented renewal queue creates more recurring value than a passive subscription register.

## 3. Demand evidence

Current evidence is weak and must be labelled honestly:

- the founder is currently the only active user;
- there are no paying users for Subscriptions;
- there is no completed customer interview set or observed external workflow;
- the existing product already contains subscription, task, notification, payment-cycle, document, and Gmail-invoice capabilities.

Therefore this document defines a testable product hypothesis, not a validated market requirement.

Competitive products show that renewal calendars, action dates, reminders, and contract evidence are established patterns. They do not prove demand for this exact product or positioning.

## 4. Target user and narrowest wedge

### Initial target user

A founder, freelancer, or small-business operator who personally manages 10–50 recurring SaaS and vendor subscriptions, sees the invoices in Gmail, and does not have a procurement team.

### Narrowest wedge

Prevent one unwanted renewal or one missed renewal decision.

The first useful outcome should happen after the user enters only:

- vendor/subscription name;
- amount and currency;
- billing cycle;
- next billing date;
- how long before renewal they want to decide.

Connecting Gmail and attaching an invoice improve confidence but are not required for activation.

### Not the initial target

- enterprise procurement teams;
- license-optimization teams requiring usage telemetry;
- consumers who only want bank-based recurring-payment detection;
- accountants seeking invoice bookkeeping automation;
- organizations requiring multi-step approvals and vendor negotiation workflows.

## 5. Product premises

1. **A renewal decision is not a payment.** “Keep” records intent. Only the existing mark-as-paid workflow may post a financial transaction.
2. **A non-renewal decision is not a cancellation.** The product records intent and can create a task or open the vendor URL, but does not claim the vendor has been cancelled.
3. **Snooze is not a business decision.** It temporarily hides attention; it does not change the canonical decision status.
4. **Gmail is evidence, not navigation.** Invoice search is contextual to a known subscription in MVP.
5. **One renewal period has one canonical decision case.** This prevents duplicate reminders and preserves audit history.
6. **Derived urgency should not be stored as truth.** “Due soon” and “overdue” are computed from dates, status, and snooze state.
7. **The interface should ask for one action at a time.** Cost analytics remain available but do not dominate the queue.
8. **Single-user usability comes first.** Ownership, approval chains, procurement policy, and team routing are deferred.

## 6. Approaches considered

### Approach A — Renewal Decision Inbox — selected

Build on existing subscriptions, payment cycles, Action Center, notifications, tasks, documents, and Gmail invoice lookup. Make renewal decisions the main Subscriptions workflow.

- Expected effort: M
- Product risk: low-to-medium
- Technical risk: low-to-medium
- Main advantage: produces a repeatable reason to return without requiring automatic discovery first

### Approach B — Gmail-first subscription discovery

Scan Gmail for candidate vendors and invoices, then propose subscriptions for confirmation.

- Expected effort: L
- Product risk: medium
- Technical/privacy risk: medium-to-high
- Deferred because discovery quality is not yet the core value proposition and may create a noisy inbox before the decision workflow is proven.

### Approach C — Savings copilot

Recommend cancellations, consolidation, and renegotiation based on cost, usage, and market data.

- Expected effort: XL
- Product risk: high
- Data dependency: high
- Deferred because trustworthy recommendations require evidence the MVP does not have.

## 7. Core user journey

### Happy path

1. The user creates a subscription or opens an existing one.
2. Nevora derives a decision date from the next billing date and the reminder lead time.
3. When the decision window opens, a renewal case appears in **Needs a decision**.
4. The card shows vendor, amount, renewal date, decide-by date, and available invoice evidence.
5. The user chooses **Keep**, **Review**, **Do not renew**, or **Later**.
6. Nevora records the decision, updates the Action Center item, schedules or cancels reminders, and writes an audit event.
7. Payment remains governed by the existing payment-cycle workflow.
8. When the subscription advances to its next renewal date, Nevora idempotently creates the next renewal case.

### Non-renewal path

1. The user selects **Do not renew**.
2. A confirmation sheet clearly says that Nevora will only record the decision.
3. If a vendor URL exists, the primary follow-up action is **Open cancellation page**.
4. The user may create a cancellation task due no later than the decision deadline.
5. The case is resolved as “Do not renew”; the subscription remains active until the user explicitly confirms cancellation through the existing cancellation workflow.

### Review path

1. The user selects **Review**.
2. The case enters `reviewing`.
3. Nevora creates or links one task, with a default due date before the decision deadline.
4. The card stays in **Needs a decision** until the user chooses **Keep** or **Do not renew**.

### Gmail evidence path

1. From the decision card or subscription detail, the user selects **Find invoice in Gmail**.
2. Existing manual Gmail search runs for this known subscription.
3. The user previews metadata and explicitly imports a selected PDF.
4. The document is linked to the subscription and becomes visible as evidence.
5. Importing the invoice does not create a transaction, mark a cycle paid, or resolve the renewal decision.

## 8. Information architecture

### Primary routes

| Route | Purpose | MVP change |
|---|---|---|
| `/subscriptions` | Renewal Decision Inbox | Becomes the primary decision surface |
| `/subscriptions/[subscriptionId]` | Subscription detail and history | Adds canonical renewal decision panel above payment workflow |
| Existing create/edit UI | Capture the minimum renewal context | Adds auto-renew and reminder lead-time fields |
| Existing Settings | Notification and Gmail preferences | Reuses existing settings; no new settings subsection required for MVP |

Documents remain a separate permanent navigation module. Subscription invoices are linked evidence and may also appear in Documents; opening Documents must not hide Subscriptions and vice versa.

## 9. Screens

### Screen S1 — Renewal Decision Inbox (`/subscriptions`)

#### Goal

Let the user understand what needs attention and complete a renewal decision without opening every subscription.

#### Desktop layout

1. Page header:
   - title: **Subscription decisions**;
   - subtitle: **Decide what to keep before the next charge.**;
   - primary CTA: **Add subscription**.
2. Compact summary row:
   - **Needs a decision** — count of visible actionable cases;
   - **Next 30 days** — expected charge total grouped by currency if necessary;
   - **Annual run rate** — existing yearly-cost calculation, visually secondary.
3. Filter bar:
   - `Needs a decision`;
   - `Upcoming payments`;
   - `Under control`;
   - `All`;
   - optional search by vendor name.
4. Primary list of decision cards.

The default filter is **Needs a decision** when at least one actionable case exists. Otherwise the default is **Upcoming payments**.

#### Mobile layout

- Same information order in one column.
- Summary is horizontally scrollable or reduced to two compact metrics; it must not push the first action below the initial viewport unnecessarily.
- Each decision card shows one primary action **Decide** and an overflow menu. Tapping **Decide** opens a bottom sheet with the four actions.
- No hover-only information or actions.

#### Decision card anatomy

Required content, in priority order:

1. subscription name and category icon;
2. urgency label: `Overdue`, `Today`, `N days left`, or `Reviewing`;
3. amount and billing cycle;
4. `Renews on {date}`;
5. `Decide by {date}`;
6. evidence state: invoice attached, Gmail available, or no invoice;
7. actions: **Keep**, **Review**, **Do not renew**, **Later**.

If currencies differ, totals must not be arithmetically combined without an explicit base-currency conversion. MVP should display grouped currency totals instead.

#### Sort order

1. overdue decision deadline;
2. decision deadline today;
3. nearest future decision deadline;
4. reviewing cases by task due date;
5. renewal date as tie-breaker;
6. name as final stable tie-breaker.

#### Inbox states

| State | UI behaviour |
|---|---|
| Loading | Skeleton for summary and 3 cards; preserve page geometry |
| Loaded with urgent cases | Open `Needs a decision`; first overdue case receives strongest emphasis |
| Loaded without urgent cases | Open `Upcoming payments`; show controlled empty state above list |
| No subscriptions | Onboarding empty state with one CTA |
| Filter has no results | Filter-specific empty state and `Clear filters` action |
| Partial data failure | Show subscriptions that loaded; isolate failed summary/evidence region with retry |
| Full failure | Error state with `Try again`; do not display zero totals as if successful |
| Offline/retryable mutation | Keep card in place, show inline failure, preserve the user’s selected action for retry |

### Screen S2 — Create or edit subscription

#### Required fields

- Name
- Amount
- Currency
- Billing cycle
- Next billing date

#### Renewal fields

- **Renews automatically**: yes/no, default `yes`
- **Remind me to decide**: preset lead time
  - 7 days before for weekly/monthly subscriptions by default;
  - 14 days before for quarterly subscriptions by default;
  - 30 days before for yearly subscriptions by default;
  - custom value: 1–180 days;
  - `Never` for subscriptions that do not require a renewal decision.

The computed date is previewed immediately:

> You’ll be asked to decide on 12 September, before renewal on 19 September.

Optional existing fields remain URL, category, note, payment settings, and initial document.

#### Validation

- Next billing date is required for an active subscription.
- Reminder lead time cannot produce a decision date after the renewal date.
- For a past next-billing date, block save and ask the user to update the date or mark the subscription inactive.
- `Never` suppresses renewal cases but does not suppress payment cycles or payment reminders.
- Turning off auto-renew changes explanatory copy only; it does not cancel the vendor subscription.

### Screen S3 — Subscription detail (`/subscriptions/[subscriptionId]`)

#### Content order

1. Header: name, status, amount, edit action.
2. **Renewal decision panel** — new primary panel.
3. Payment workflow panel — existing.
4. Invoice/document evidence — existing Gmail and document functionality, consolidated visually.
5. Notes and vendor link.
6. Timeline: decision, payment, invoice, and cancellation events.
7. Related entities.

#### Renewal decision panel

Displays:

- current derived attention state;
- renewal date;
- decide-by date;
- current decision and who/when decided;
- linked review task, if any;
- four decision actions for unresolved cases;
- **Change decision** for resolved cases.

The panel must explicitly distinguish:

- **Decision:** Keep / Reviewing / Do not renew / Not decided
- **Payment:** Planned / Paid / Skipped / Overdue
- **Vendor status:** Active / Cancellation recorded

These labels must never be merged into one generic “status”.

### Screen S4 — Decision sheet/modal

The same component is used from the list and detail page. On desktop it is a modal or anchored sheet; on mobile it is a bottom sheet.

#### Action A — Keep

Content:

- title: **Keep {subscriptionName}?**
- explanation: **This records your renewal decision. Payment will still be tracked separately.**
- optional note;
- primary action: **Confirm keep**;
- secondary action: **Back**.

After success, the case moves to **Under control** and a non-blocking toast appears.

#### Action B — Review

Content:

- title: **Review before renewal**;
- task title, prefilled: **Review {subscriptionName} renewal**;
- due date, defaulting to the earlier of `decision deadline - 1 day` and `today + 3 days`;
- optional note;
- primary action: **Start review**.

If the computed default is in the past, use today. Only one open review task may be linked to a renewal case.

#### Action C — Do not renew

Content:

- title: **Do not renew {subscriptionName}?**
- warning: **Nevora will record your decision, but it cannot cancel the subscription with the provider.**
- checkbox, default checked: **Create a cancellation task**;
- task due date, default today and never later than the decision deadline;
- vendor-link action when URL exists: **Open provider website**;
- primary action: **Confirm non-renewal**.

This action does not set `subscriptions.is_active = false` and does not populate `cancelled_at`.

#### Action D — Later

Content:

- title: **Remind me later**;
- presets: **Tomorrow**, **In 3 days**, **In 7 days**, **Choose date**;
- unavailable presets are disabled if they fall after the renewal date;
- if a selected date is later than the decision deadline, show a warning but allow it up to the renewal date;
- primary action: **Snooze**.

Snooze sets `snoozed_until` while preserving `pending` or `reviewing` as the canonical decision status.

### Screen S5 — Onboarding and empty states

#### First-run empty state

Title:

> Never miss a subscription decision.

Body:

> Add a recurring payment and Nevora will tell you when it is time to keep, review, or stop it.

Primary CTA: **Add first subscription**  
Secondary link: **How it works**

Do not make Gmail connection the primary CTA. It is optional supporting evidence in Approach A.

#### No decisions due

Title:

> Everything is under control.

Body:

> There are no subscription decisions due right now. The next payment is {name} on {date}.

CTA: **View upcoming payments**

#### No upcoming payment

Title:

> No upcoming payments.

Body:

> Add a billing date to an active subscription to track its next charge.

CTA: **Review subscriptions**

## 10. State model

### 10.1 Canonical renewal-case state

Create one renewal case per subscription and renewal date. Recommended storage name:

`subscription_renewal_cases`

Minimum fields:

| Field | Purpose |
|---|---|
| `id` | Stable case identifier |
| `organization_id`, `workspace_id`, `user_id` | Existing tenancy and access model |
| `subscription_id` | Parent subscription |
| `renewal_date` | Billing/renewal occurrence this decision applies to |
| `decision_due_date` | Date on which attention becomes urgent |
| `status` | `pending`, `reviewing`, `keep`, `wont_renew` |
| `snoozed_until` | Temporary attention suppression; nullable |
| `decision_note` | Optional user context |
| `decided_at`, `decided_by` | Audit data for resolved decisions |
| `review_task_id` | One linked task; nullable |
| `created_at`, `updated_at` | Audit timestamps |

Required uniqueness:

`(organization_id, subscription_id, renewal_date)`

This makes case creation idempotent and keeps renewal decisions separate from `subscription_payment_cycles`.

### 10.2 Canonical statuses

| Status | Meaning | Resolved? |
|---|---|---|
| `pending` | No renewal decision has been made | No |
| `reviewing` | The user started a review but has not decided | No |
| `keep` | The user intends to continue for this renewal | Yes |
| `wont_renew` | The user intends not to continue for this renewal | Yes |

`snoozed` and `overdue` are not canonical statuses.

### 10.3 Derived attention states

| Derived state | Rule |
|---|---|
| `not_required` | Reminder lead time is `Never`, or subscription is inactive/cancelled |
| `future` | Unresolved case exists and today is before decision due date |
| `needs_decision` | `pending`, decision window open, not currently snoozed |
| `reviewing` | Canonical status is `reviewing`, not currently snoozed |
| `snoozed` | Unresolved and `snoozed_until` is in the future |
| `overdue` | Unresolved, not snoozed, and decision due date is in the past |
| `resolved_keep` | Canonical status is `keep` |
| `resolved_wont_renew` | Canonical status is `wont_renew` |

Date comparisons use the organization/user timezone already established by the application. UI displays local dates; stored timestamps remain UTC.

### 10.4 Allowed transitions

| From | Action | To | Side effects |
|---|---|---|---|
| `pending` | Keep | `keep` | Complete renewal Action Center item; cancel unresolved-decision reminders |
| `pending` | Review | `reviewing` | Create/link task; keep Action Center item open/in progress |
| `pending` | Do not renew | `wont_renew` | Optionally create cancellation task; complete renewal decision item |
| `pending` | Later | `pending` | Set `snoozed_until`; snooze linked Action Center item |
| `reviewing` | Keep | `keep` | Complete decision item; review task remains independently completable |
| `reviewing` | Do not renew | `wont_renew` | Complete decision item; optionally create cancellation task |
| `reviewing` | Later | `reviewing` | Set `snoozed_until` |
| `keep` | Change decision | `pending` or `wont_renew` | Audit previous decision and reschedule reminders if unresolved |
| `wont_renew` | Change decision | `pending` or `keep` | Audit previous decision; never reactivate a cancelled vendor subscription automatically |

### 10.5 Renewal rollover

When the existing payment workflow advances `next_billing_date`:

1. Keep the resolved prior renewal case as history.
2. Idempotently create the next case when renewal decisions are enabled.
3. Derive its `decision_due_date` from the new next billing date and configured lead time.
4. Do not copy the previous decision to the new case.
5. Do not create a new case for inactive or cancelled subscriptions.

If a billing date changes before resolution, update the unresolved case’s renewal and decision dates and reschedule reminders. If it changes after resolution, preserve the historical case and create or reconcile the case for the new date.

## 11. Events

Events are split into domain/audit events and product-analytics events. Domain events describe facts the system must be able to reconstruct; analytics events measure behaviour and may be sampled separately.

### 11.1 Domain and audit events

| Event | Emitted when | Required properties |
|---|---|---|
| `subscription.renewal_case.created` | A new per-period case is created | `subscription_id`, `renewal_case_id`, `renewal_date`, `decision_due_date` |
| `subscription.renewal_decision.review_started` | User selects Review | IDs, previous status, task ID, due date |
| `subscription.renewal_decision.keep` | User confirms Keep | IDs, previous status, decision note, actor |
| `subscription.renewal_decision.wont_renew` | User confirms non-renewal | IDs, previous status, task ID if created, actor |
| `subscription.renewal_decision.snoozed` | User snoozes the case | IDs, canonical status, previous and new snooze times |
| `subscription.renewal_decision.reopened` | A resolved decision is reopened/changed | IDs, previous decision, new status, actor |
| `subscription.renewal_deadline.missed` | Sweep first detects an unresolved overdue case | IDs, deadline, days overdue; once per case/deadline |
| `subscription.invoice.linked` | A document is successfully linked as invoice evidence | subscription, document, source, message ID when Gmail-derived |

Existing payment events remain unchanged, including:

- `subscription.payment_cycle.created`
- `subscription.payment_cycle.paid`
- `subscription.payment_cycle.skipped`
- `subscription.payment_due_date.changed`
- `subscription.payment_task.created`
- `subscription.cancelled`

No renewal-decision event may substitute for `subscription.cancelled` or `subscription.payment_cycle.paid`.

### 11.2 UI analytics events

| Event | Purpose |
|---|---|
| `subscriptions_inbox_viewed` | Measure return usage and default-filter relevance |
| `renewal_card_opened` | Measure whether cards provide enough context |
| `renewal_action_started` | Compare action intent by action type |
| `renewal_decision_submitted` | Measure completed Keep/Review/Do-not-renew actions |
| `renewal_snoozed` | Detect reminder deferral and possible noise |
| `renewal_decision_failed` | Measure mutation reliability by error code |
| `subscription_created` | Activation funnel |
| `gmail_invoice_search_started` | Evidence-demand funnel |
| `gmail_invoice_imported` | Successful evidence attachment |

Minimum common properties:

- `organization_id` and pseudonymous user/session ID;
- `subscription_id` and `renewal_case_id` where applicable;
- surface: `inbox`, `detail`, `notification`, `action_center`;
- action type;
- days until decision deadline and renewal;
- whether invoice evidence was present;
- client platform: desktop/mobile;
- locale.

Do not include Gmail subject/body, invoice contents, free-text notes, or vendor-sensitive document data in analytics payloads.

## 12. Notifications and Action Center

### Action Center contract

- One open `renewal_required` Action Center item per unresolved renewal case.
- `pending` maps to `open`.
- `reviewing` maps to `in_progress`.
- a future `snoozed_until` maps to `snoozed`.
- `keep` and `wont_renew` complete the item.
- Reopening a decision reopens or idempotently recreates the linked item.

### Default notification schedule

For unresolved, non-snoozed cases:

1. At the opening of the decision window.
2. On the decision deadline, if still unresolved.
3. One overdue notification the following day, if still unresolved.

Do not send daily overdue notifications in MVP.

Snooze schedules one return notification at `snoozed_until`. A new snooze replaces the previous snooze-return schedule.

### Notification action

Clicking a renewal notification opens the exact renewal case on `/subscriptions` or the subscription detail page and must expose the four decision actions immediately.

## 13. Product copy

The following copy is the source of truth for the main MVP surfaces. All shipped locales (currently RU/EN/RO) must receive semantic equivalents before release; untranslated English fallbacks are not acceptable for primary actions.

### 13.1 Navigation and page copy

| Key | Russian | English |
|---|---|---|
| `subscriptions.nav` | Подписки | Subscriptions |
| `subscriptions.inbox.title` | Решения по подпискам | Subscription decisions |
| `subscriptions.inbox.subtitle` | Решите, что оставить, до следующего списания. | Decide what to keep before the next charge. |
| `subscriptions.add` | Добавить подписку | Add subscription |
| `subscriptions.tabs.needsDecision` | Требуют решения | Needs a decision |
| `subscriptions.tabs.upcoming` | Ближайшие платежи | Upcoming payments |
| `subscriptions.tabs.controlled` | Под контролем | Under control |
| `subscriptions.tabs.all` | Все | All |
| `subscriptions.metrics.needsDecision` | Требуют решения | Needs a decision |
| `subscriptions.metrics.next30Days` | Следующие 30 дней | Next 30 days |
| `subscriptions.metrics.annualRunRate` | Расходы за год | Annual run rate |

### 13.2 Card copy

| Key | Russian | English |
|---|---|---|
| `subscriptions.card.renewsOn` | Продление {date} | Renews on {date} |
| `subscriptions.card.decideBy` | Решить до {date} | Decide by {date} |
| `subscriptions.card.overdue` | Решение просрочено на {days} дн. | Decision overdue by {days}d |
| `subscriptions.card.today` | Решить сегодня | Decide today |
| `subscriptions.card.daysLeft` | Осталось {days} дн. | {days}d left |
| `subscriptions.card.invoiceAttached` | Инвойс прикреплён | Invoice attached |
| `subscriptions.card.noInvoice` | Инвойс не найден | No invoice attached |
| `subscriptions.card.findInvoice` | Найти инвойс в Gmail | Find invoice in Gmail |
| `subscriptions.action.keep` | Оставить | Keep |
| `subscriptions.action.review` | Проверить | Review |
| `subscriptions.action.wontRenew` | Не продлевать | Do not renew |
| `subscriptions.action.later` | Позже | Later |

Use **Оставить / Keep**, not **Продлить / Renew**, for the decision action. “Renew” can sound like an immediate vendor-side or payment action; “Keep” describes intent more accurately.

### 13.3 Confirmation copy

| Surface | Russian | English |
|---|---|---|
| Keep title | Оставить {name}? | Keep {name}? |
| Keep body | Решение будет сохранено. Платёж по-прежнему отслеживается отдельно. | This records your renewal decision. Payment will still be tracked separately. |
| Keep CTA | Подтвердить | Confirm keep |
| Review title | Проверить перед продлением | Review before renewal |
| Review CTA | Начать проверку | Start review |
| Non-renew title | Не продлевать {name}? | Do not renew {name}? |
| Non-renew warning | Nevora сохранит решение, но не отменит подписку у поставщика. | Nevora will record your decision, but it cannot cancel the subscription with the provider. |
| Non-renew task | Создать задачу на отмену | Create a cancellation task |
| Non-renew CTA | Подтвердить отказ | Confirm non-renewal |
| Snooze title | Напомнить позже | Remind me later |
| Snooze tomorrow | Завтра | Tomorrow |
| Snooze 3d | Через 3 дня | In 3 days |
| Snooze 7d | Через 7 дней | In 7 days |
| Snooze custom | Выбрать дату | Choose date |
| Snooze CTA | Отложить | Snooze |

### 13.4 Success and error copy

| Situation | Russian | English |
|---|---|---|
| Keep saved | Решение сохранено: оставить {name}. | Decision saved: keep {name}. |
| Review started | Проверка начата. Задача создана. | Review started. Task created. |
| Non-renew saved | Решение сохранено. Не забудьте отменить подписку у поставщика. | Decision saved. Remember to cancel with the provider. |
| Snoozed | Напомним {date}. | We’ll remind you on {date}. |
| Generic mutation failure | Не удалось сохранить решение. Попробуйте ещё раз. | We couldn’t save the decision. Try again. |
| Stale case conflict | Данные подписки изменились. Обновите страницу и проверьте дату продления. | This subscription changed. Refresh and review the renewal date. |
| Gmail not connected | Подключите Gmail, чтобы найти инвойсы для этой подписки. | Connect Gmail to find invoices for this subscription. |

### 13.5 Empty-state copy

| State | Russian | English |
|---|---|---|
| No subscriptions title | Не пропускайте решения по подпискам. | Never miss a subscription decision. |
| No subscriptions body | Добавьте регулярный платёж, и Nevora подскажет, когда его оставить, проверить или остановить. | Add a recurring payment and Nevora will tell you when it is time to keep, review, or stop it. |
| No decisions title | Всё под контролем. | Everything is under control. |
| No decisions body | Сейчас нет подписок, требующих решения. Следующий платёж: {name}, {date}. | There are no subscription decisions due right now. The next payment is {name} on {date}. |
| No filter results | По этим условиям подписки не найдены. | No subscriptions match these filters. |
| Clear filters | Сбросить фильтры | Clear filters |

## 14. MVP scope

### In scope

1. Renewal Decision Inbox on `/subscriptions` with four stable filters.
2. One idempotent renewal case per subscription and renewal date.
3. Canonical decisions: pending, reviewing, keep, and do not renew.
4. Snooze as a temporary attention attribute, not a decision status.
5. Decision lead-time field and computed decide-by date.
6. Default lead times by billing cycle plus 1–180-day custom value and `Never`.
7. Four user actions: Keep, Review, Do not renew, Later.
8. One linked review task and optional cancellation task.
9. Action Center synchronization and three-step notification policy.
10. Existing Gmail manual invoice lookup from a known subscription.
11. Existing explicit PDF import and subscription-document linkage.
12. Clear separation of renewal decision, payment status, and vendor cancellation status.
13. Domain audit events and minimum product analytics.
14. Responsive desktop/mobile behaviour.
15. Complete RU/EN/RO localization for new primary surfaces.
16. Permission/RLS behaviour consistent with existing organization and workspace isolation.
17. Idempotent rollover when `next_billing_date` advances.

### Explicitly out of scope

1. Automatic Gmail-wide discovery of subscriptions.
2. Automatic creation of subscriptions from email.
3. Automatic vendor cancellation, email sending, or form submission.
4. Automatic payment posting from an invoice or renewal decision.
5. Bank/card connection and recurring-payment detection.
6. License usage telemetry and inactive-seat detection.
7. AI cancellation, consolidation, or negotiation recommendations.
8. Market pricing benchmarks and vendor intelligence.
9. Multi-step approval workflows, renewal owners, procurement roles, or escalations.
10. Vendor negotiation pipelines and savings attribution.
11. Contract clause extraction or legally authoritative cancellation deadlines.
12. Daily overdue reminders or cross-channel SMS/WhatsApp reminders.
13. Weekly executive email digest.
14. New document-management functionality beyond linking existing documents.
15. Combining different currencies into an unlabelled single total.

### Non-goals that must remain true

- “Do not renew” is not proof that cancellation happened.
- “Keep” is not proof that payment happened.
- An imported invoice is not proof that payment happened.
- A completed review task is not automatically a renewal decision.
- A payment-cycle update must not silently overwrite a user’s historical renewal decision.

## 15. Success criteria

Because the founder is the only current user, success must be split into product-quality criteria and external validation criteria.

### Product-quality acceptance

- The founder can enter three real subscriptions and see correct decision dates in under five minutes.
- Every unresolved renewal case appears exactly once across Inbox and Action Center.
- A decision can be completed from the Inbox without opening the detail page.
- Reloading or retrying a mutation cannot create duplicate cases, tasks, reminders, or events.
- No decision action posts a financial transaction or falsely marks vendor cancellation.
- Invoice import remains explicit and does not mutate financial state.
- The workflow passes on narrow mobile and desktop layouts with all primary actions reachable by keyboard and touch.
- All primary copy exists in RU, EN, and RO.

### Early usage metrics

- Primary: percentage of renewal cases resolved before the decision deadline.
- Secondary: percentage of opened cases that receive a decision rather than only repeated snoozes.
- Reliability: failed decision mutations below 1% in normal operation.
- Noise guardrail: average snoozes per resolved case below 2.
- Safety guardrail: zero unintended transactions and zero false cancellation confirmations.

These are directional during founder-only use and should not be presented as market validation.

### External validation gate

Before building Gmail-wide discovery or savings intelligence:

- observe 5 target users managing their real recurring subscriptions;
- at least 3 enter or import 3+ real subscriptions;
- at least 2 return in response to a real renewal reminder or complete a decision during the test window;
- at least 1 gives a concrete payment signal: paid pilot, deposit, or signed intent with a named price and start date.

If these signals do not occur, revisit the target segment and problem before expanding the feature set.

## 16. Dependencies

### Existing capabilities to reuse

- subscriptions CRUD and summary calculations;
- payment-cycle and mark-as-paid workflow;
- tasks and Action Center `renewal_required` items;
- durable reminder schedules and snooze return;
- notifications and subscription preference category;
- documents and entity relationships;
- manual per-subscription Gmail invoice search/import;
- activity/audit event pipeline;
- organization/workspace isolation and RLS.

### New product dependencies

- renewal-case persistence and RLS policies;
- lead-time configuration on a subscription;
- idempotent case creation/reconciliation in the existing sweep/runtime;
- decision mutation contract with optimistic concurrency or updated-at guard;
- Inbox query that returns canonical and derived states;
- Action Center/reminder adapters for renewal cases;
- localization keys and analytics schema.

## 17. Open questions

These questions do not block the design direction but should be resolved before implementation planning:

1. Should a monthly subscription ask for a decision every month, or only at a separate review cadence? MVP recommendation: create a case every billing period only when renewal reminders are enabled; validate whether monthly repetition becomes noisy.
2. Should `decision_due_date` be a date or timestamp? MVP recommendation: store a date and trigger notifications at the user’s configured local reminder time.
3. Can a completed review task prompt a decision sheet? Recommendation: yes, but never auto-decide.
4. When “Do not renew” is selected, should the existing cancellation flow be offered inline? Recommendation: offer it as a separate explicit follow-up only after the user confirms vendor cancellation.
5. Should resolved cases remain visible in **Under control** until renewal date or for a fixed history window? Recommendation: until renewal date, then move to the detail timeline/history.
6. What is the Romanian copy review owner? A native-language review is required before release.

## 18. Rollout sequence

This is a design sequence, not implementation authorization.

### Slice 1 — Founder-usable decision inbox

- renewal-case data model;
- lead time and decide-by date;
- Inbox filters and cards;
- Keep, Review, Do not renew, Later;
- Action Center synchronization;
- audit events;
- detail panel.

### Slice 2 — Reminder reliability and evidence

- notification schedule and snooze return;
- Gmail evidence entry points from Inbox and detail;
- timeline consolidation;
- analytics events and reliability checks.

### Slice 3 — Validation polish

- copy/localization QA;
- mobile/keyboard/accessibility QA;
- founder data cleanup and 5-user observed validation;
- decision on whether to proceed to Approach B.

## 19. The assignment

Within one week of a clickable founder-ready version, recruit five founders/freelancers who personally manage at least ten recurring business subscriptions. Ask each person to add three real subscriptions and resolve one real or simulated decision while you observe silently.

Record only:

- where they hesitate;
- which date they think matters;
- whether “Keep”, “Review”, and “Do not renew” mean what the design expects;
- whether they want invoice evidence before deciding;
- whether they trust the reminder enough to rely on it;
- whether they will pay for the workflow and at what concrete price.

Do not add requested features during the five sessions. Complete the set first, then compare repeated problems.

## 20. What I noticed

- The existing implementation is already stronger in workflow safety than the current demand evidence: payment cycles are separated, Gmail import is explicit, and reminders/tasks exist. The highest leverage is product focus, not another integration.
- The current subscription list emphasizes counts and cost totals. Approach A changes the hierarchy from “what subscriptions exist?” to “what decision is due?” without discarding the existing data.
- Existing `renewal_required`, snooze scheduling, and notification infrastructure make the selected approach materially smaller than building discovery first.
- The largest conceptual risk is status conflation. Renewal intent, provider cancellation, invoice evidence, and payment must remain visibly and technically separate.
- The largest product risk is reminder fatigue for monthly subscriptions. This must be observed before expanding reminder volume.
- The founder deliberately skipped the discovery questionnaire. The assumptions in this document therefore need behavioural validation before the scope expands beyond MVP.

## 21. Reference patterns

- Ramp Contracts & Renewals: contract renewal dates, last date to action, reminders, snooze, and renewal/non-renewal outcomes: <https://support.ramp.com/contracts-renewals/>
- Cledara renewal dates and configurable reminders: <https://help.cledara.com/hc/en-gb/articles/30575217794834-Set-the-next-renewal-date-of-an-application>
- Rocket Money subscription control centre and upcoming recurring charges: <https://www.rocketmoney.com/feature/manage-subscriptions>
- Zylo SaaS renewal lifecycle and checkpoints: <https://zylo.com/blog/guide-saas-renewal>

These are interface and workflow references only. They are not evidence that Nevora has validated demand.

