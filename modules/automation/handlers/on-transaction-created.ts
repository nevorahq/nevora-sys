import { createEntityLink } from "@/lib/entity-links";
import type { AutomationHandler } from "../engine/automation-handler.types";

/**
 * transaction.created → если транзакция оплачивает подписку
 * (payload несёт subscription_id), связать transaction --paid_by--> subscription.
 *
 * Иначе skipped. Демонстрирует кросс-модульную связь money ↔ subscriptions.
 */
export const onTransactionCreated: AutomationHandler = {
  name: "on-transaction-created",
  eventName: "money.transaction.created",
  async run(ctx) {
    const subscriptionId = ctx.payload.subscription_id;

    if (typeof subscriptionId !== "string") {
      return {
        status: "skipped",
        output: { reason: "transaction is not linked to a subscription" },
      };
    }

    const res = await createEntityLink({
      sourceType: "transaction",
      sourceId: ctx.aggregateId,
      targetType: "subscription",
      targetId: subscriptionId,
      linkType: "paid_by",
      metadata: { source: "auto", matched_by: ["subscription_id"] },
    });

    if (!res.ok) {
      return { status: "failed", errorMessage: res.error };
    }

    return { status: "executed", output: { entityLinkId: res.data.id } };
  },
};
