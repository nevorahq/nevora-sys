import type { SubscriptionsApplication } from "./index";
import type { SubscriptionsHttpRequest } from "./http";

/** Dispatch a validated wire request onto one bound Subscriptions application. */
export async function executeSubscriptionsRequest(
  application: SubscriptionsApplication,
  request: SubscriptionsHttpRequest,
): Promise<unknown> {
  switch (request.operation) {
    case "getSubscriptions":
      return application.getSubscriptions();
    case "getPaymentCycleByTaskId":
      return application.getPaymentCycleByTaskId(request.input.taskId);
    case "getPaymentCycleByTransactionId":
      return application.getPaymentCycleByTransactionId(request.input.transactionId);
    case "createSubscriptionPaymentCycle":
      return application.createSubscriptionPaymentCycle(request.input);
    case "createSubscriptionPaymentTaskForCycle":
      return application.createSubscriptionPaymentTaskForCycle(request.input);
  }
}
