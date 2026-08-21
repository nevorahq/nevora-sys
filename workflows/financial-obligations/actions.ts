"use server";

import { markFinancialTaskPaidAction as markFinancialTaskPaid } from "./actions/mark-financial-task-paid.action";
import { markSubscriptionPaymentAction as markSubscriptionPayment } from "./actions/mark-subscription-payment.action";
import { createAccountForObligationAction as createAccountForObligation } from "./actions/create-account-for-obligation.action";

export async function createAccountForObligationAction(
  ...args: Parameters<typeof createAccountForObligation>
) {
  return createAccountForObligation(...args);
}

export async function markFinancialTaskPaidAction(
  ...args: Parameters<typeof markFinancialTaskPaid>
) {
  return markFinancialTaskPaid(...args);
}

export async function markSubscriptionPaymentAction(
  ...args: Parameters<typeof markSubscriptionPayment>
) {
  return markSubscriptionPayment(...args);
}
