import "server-only";

import type { FinanceApplication, FinanceRequestContext } from "@nevora/finance-api";
import {
  FINANCE_HTTP_ENDPOINT,
  FINANCE_HTTP_TRANSPORT_HEADER,
  FINANCE_HTTP_TRANSPORT_VERSION,
  type FinanceHttpRequest,
  type FinanceHttpResponse,
} from "@nevora/finance-api";

export interface HttpFinanceDependencies {
  baseUrl: string;
  cookieHeader?: string;
  serviceTokenFactory?: (request: FinanceHttpRequest) => string | Promise<string>;
  context: Readonly<FinanceRequestContext>;
  fetchImplementation?: typeof fetch;
}

export class FinanceTransportError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "FinanceTransportError";
    this.status = status;
  }
}

/** Authenticated HTTP implementation of the portable Finance API. */
export function createHttpFinanceApplication(
  dependencies: HttpFinanceDependencies,
): FinanceApplication {
  const endpoint = new URL(FINANCE_HTTP_ENDPOINT, ensureTrailingSlash(dependencies.baseUrl));
  const fetchImplementation = dependencies.fetchImplementation ?? fetch;

  async function send<T>(payload: FinanceHttpRequest): Promise<T> {
    if (!dependencies.cookieHeader && !dependencies.serviceTokenFactory) {
      throw new FinanceTransportError("Finance HTTP transport has no authentication method.");
    }
    const serviceToken = dependencies.serviceTokenFactory
      ? await dependencies.serviceTokenFactory(payload)
      : null;
    const requestHeaders: Record<string, string> = {
      "content-type": "application/json",
      [FINANCE_HTTP_TRANSPORT_HEADER]: FINANCE_HTTP_TRANSPORT_VERSION,
    };
    if (dependencies.cookieHeader) requestHeaders.cookie = dependencies.cookieHeader;
    if (serviceToken) requestHeaders.authorization = `Bearer ${serviceToken}`;

    let response: Response;
    try {
      response = await fetchImplementation(endpoint, {
        method: "POST",
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        headers: requestHeaders,
        body: JSON.stringify(payload),
      });
    } catch {
      throw new FinanceTransportError("Finance API is unavailable.");
    }

    let body: FinanceHttpResponse<T> | null = null;
    try {
      body = (await response.json()) as FinanceHttpResponse<T>;
    } catch {
      throw new FinanceTransportError("Finance API returned an invalid response.", response.status);
    }

    if (!response.ok || !body.ok) {
      const message = body && !body.ok ? body.error : `Finance API request failed (${response.status}).`;
      throw new FinanceTransportError(message, response.status);
    }
    return body.data;
  }

  return {
    context: dependencies.context,
    getAccounts: () => send({ operation: "getAccounts", input: {} }),
    findActiveMoneyAccountsByCurrency: (currency) =>
      send({ operation: "findActiveMoneyAccountsByCurrency", input: { currency } }),
    createMoneyAccount: (input) => send({ operation: "createMoneyAccount", input }),
    findDuplicateTransaction: (input) => send({ operation: "findDuplicateTransaction", input }),
  };
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
