import "server-only";

import type { SubscriptionsApplication, SubscriptionsRequestContext } from "@nevora/subscriptions-api";
import {
  SUBSCRIPTIONS_HTTP_ENDPOINT,
  SUBSCRIPTIONS_HTTP_TRANSPORT_HEADER,
  SUBSCRIPTIONS_HTTP_TRANSPORT_VERSION,
  type SubscriptionsHttpRequest,
  type SubscriptionsHttpResponse,
} from "@nevora/subscriptions-api";

export interface HttpSubscriptionsDependencies {
  baseUrl: string;
  cookieHeader?: string;
  serviceTokenFactory?: (request: SubscriptionsHttpRequest) => string | Promise<string>;
  context: Readonly<SubscriptionsRequestContext>;
  fetchImplementation?: typeof fetch;
}

export class SubscriptionsTransportError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "SubscriptionsTransportError";
    this.status = status;
  }
}

/** Authenticated HTTP implementation of the portable Subscriptions API. */
export function createHttpSubscriptionsApplication(
  dependencies: HttpSubscriptionsDependencies,
): SubscriptionsApplication {
  const endpoint = new URL(SUBSCRIPTIONS_HTTP_ENDPOINT, ensureTrailingSlash(dependencies.baseUrl));
  const fetchImplementation = dependencies.fetchImplementation ?? fetch;

  async function send<T>(payload: SubscriptionsHttpRequest): Promise<T> {
    if (!dependencies.cookieHeader && !dependencies.serviceTokenFactory) {
      throw new SubscriptionsTransportError("Subscriptions HTTP transport has no authentication method.");
    }
    const serviceToken = dependencies.serviceTokenFactory
      ? await dependencies.serviceTokenFactory(payload)
      : null;
    const requestHeaders: Record<string, string> = {
      "content-type": "application/json",
      [SUBSCRIPTIONS_HTTP_TRANSPORT_HEADER]: SUBSCRIPTIONS_HTTP_TRANSPORT_VERSION,
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
      throw new SubscriptionsTransportError("Subscriptions API is unavailable.");
    }

    let body: SubscriptionsHttpResponse<T> | null = null;
    try {
      body = (await response.json()) as SubscriptionsHttpResponse<T>;
    } catch {
      throw new SubscriptionsTransportError("Subscriptions API returned an invalid response.", response.status);
    }

    if (!response.ok || !body.ok) {
      const message = body && !body.ok ? body.error : `Subscriptions API request failed (${response.status}).`;
      throw new SubscriptionsTransportError(message, response.status);
    }
    return body.data;
  }

  return {
    context: dependencies.context,
    getSubscriptions: () => send({ operation: "getSubscriptions", input: {} }),
    getPaymentCycleByTaskId: (taskId) => send({ operation: "getPaymentCycleByTaskId", input: { taskId } }),
    getPaymentCycleByTransactionId: (transactionId) =>
      send({ operation: "getPaymentCycleByTransactionId", input: { transactionId } }),
    createSubscriptionPaymentCycle: (input) =>
      send({ operation: "createSubscriptionPaymentCycle", input }),
    createSubscriptionPaymentTaskForCycle: (input) =>
      send({ operation: "createSubscriptionPaymentTaskForCycle", input }),
  };
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
