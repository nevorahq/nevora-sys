import type { FinanceApplication } from "./index";
import type { FinanceHttpRequest } from "./http";

/** Dispatch a validated wire request onto one bound Finance application. */
export async function executeFinanceRequest(
  application: FinanceApplication,
  request: FinanceHttpRequest,
): Promise<unknown> {
  switch (request.operation) {
    case "getAccounts":
      return application.getAccounts();
    case "findActiveMoneyAccountsByCurrency":
      return application.findActiveMoneyAccountsByCurrency(request.input.currency);
    case "createMoneyAccount":
      return application.createMoneyAccount(request.input);
    case "findDuplicateTransaction":
      return application.findDuplicateTransaction(request.input);
  }
}
