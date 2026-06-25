import type { AutomationHandler } from "../engine/automation-handler.types";

/**
 * subscription.renewed — точка интеграции под будущие автоматизации
 * (например: создать транзакцию-расход на сумму продления и связать её
 * с подпиской через entity_link 'renewed_by').
 *
 * Phase 1 — фундамент: автоматического создания транзакции ещё нет
 * (это потребует записи в money от имени пользователя и согласия на правила),
 * поэтому хендлер возвращает skipped с контекстом для будущей логики.
 */
export const onSubscriptionRenewed: AutomationHandler = {
  name: "on-subscription-renewed",
  eventName: "subscription.renewed",
  async run(ctx) {
    return {
      status: "skipped",
      output: {
        reason: "no automation rule (Phase 1 foundation)",
        subscriptionId: ctx.aggregateId,
      },
    };
  },
};
