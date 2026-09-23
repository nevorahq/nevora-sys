"use server";

import { createSubscriptionAction as createSubscription } from "./actions/create-subscription.action";
import { updateSubscriptionAction as updateSubscription } from "./actions/update-subscription.action";
import { deleteSubscriptionAction as deleteSubscription } from "./actions/delete-subscription.action";
import { renewSubscriptionAction as renewSubscription } from "./actions/renew-subscription.action";
import { skipSubscriptionPaymentAction as skipSubscriptionPayment } from "./actions/skip-subscription-payment.action";
import { markSubscriptionPaymentAction as markSubscriptionPayment } from "./actions/mark-subscription-payment.action";
import { changeSubscriptionPaymentDueDateAction as changeSubscriptionPaymentDueDate } from "./actions/change-subscription-payment-due-date.action";
import { cancelSubscriptionAction as cancelSubscription } from "./actions/cancel-subscription.action";
import { applyRenewalDecisionAction as applyRenewalDecision } from "./actions/apply-renewal-decision.action";

export async function createSubscriptionAction(...args: Parameters<typeof createSubscription>) {
  return createSubscription(...args);
}

export async function updateSubscriptionAction(...args: Parameters<typeof updateSubscription>) {
  return updateSubscription(...args);
}

export async function deleteSubscriptionAction(...args: Parameters<typeof deleteSubscription>) {
  return deleteSubscription(...args);
}

export async function renewSubscriptionAction(...args: Parameters<typeof renewSubscription>) {
  return renewSubscription(...args);
}

export async function skipSubscriptionPaymentAction(
  ...args: Parameters<typeof skipSubscriptionPayment>
) {
  return skipSubscriptionPayment(...args);
}

export async function markSubscriptionPaymentAction(
  ...args: Parameters<typeof markSubscriptionPayment>
) {
  return markSubscriptionPayment(...args);
}

export async function changeSubscriptionPaymentDueDateAction(
  ...args: Parameters<typeof changeSubscriptionPaymentDueDate>
) {
  return changeSubscriptionPaymentDueDate(...args);
}

export async function cancelSubscriptionAction(...args: Parameters<typeof cancelSubscription>) {
  return cancelSubscription(...args);
}

export async function applyRenewalDecisionAction(...args: Parameters<typeof applyRenewalDecision>) {
  return applyRenewalDecision(...args);
}
