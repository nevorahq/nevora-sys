import "server-only";

import type { PaddleConfig } from "../config/paddle-env";

/**
 * Minimal Paddle Billing API client.
 *
 * Only the two calls the product needs: open a checkout for a plan, and open the
 * customer portal. Everything else about a subscription's lifecycle arrives
 * through the webhook — the app never asks Paddle what a subscription's state
 * is, it is told.
 *
 * Base URLs and auth per https://developer.paddle.com/api-reference/about/authentication
 */
const BASE_URL = {
  sandbox: "https://sandbox-api.paddle.com",
  production: "https://api.paddle.com",
} as const;

/** Never let a provider call hang a Server Action indefinitely. */
const TIMEOUT_MS = 10_000;

export class PaddleApiError extends Error {
  constructor(
    readonly status: number,
    /** Paddle's machine-readable error code, e.g. `transaction_default_checkout_url_not_set`. */
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "PaddleApiError";
  }
}

type PaddleEnvelope<T> = {
  data?: T;
  error?: { code?: string; detail?: string };
};

async function paddleFetch<T>(
  config: PaddleConfig,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<T> {
  if (!config.apiKey) {
    throw new PaddleApiError(0, "api_key_missing", "PADDLE_API_KEY is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL[config.environment]}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new PaddleApiError(
      0,
      aborted ? "timeout" : "network_error",
      aborted ? `Paddle did not respond within ${TIMEOUT_MS}ms.` : "Could not reach Paddle.",
    );
  } finally {
    clearTimeout(timeout);
  }

  let envelope: PaddleEnvelope<T> = {};
  try {
    envelope = (await response.json()) as PaddleEnvelope<T>;
  } catch {
    // A non-JSON body on an error status is still an error; on success it is a bug.
  }

  if (!response.ok || envelope.error) {
    const code = envelope.error?.code ?? null;
    // The detail may name the account, never the API key — but keep it short and
    // let the caller decide what reaches a user.
    throw new PaddleApiError(
      response.status,
      code,
      envelope.error?.detail ?? `Paddle responded ${response.status}.`,
    );
  }

  if (envelope.data === undefined) {
    throw new PaddleApiError(response.status, "empty_response", "Paddle returned no data.");
  }
  return envelope.data;
}

type TransactionResponse = {
  id: string;
  checkout?: { url?: string | null } | null;
};

/**
 * Creates a `ready` transaction and returns its hosted checkout URL.
 *
 * `checkout.url` is null unless a **default payment link** is configured under
 * Checkout → Checkout settings in the Paddle dashboard; Paddle may also refuse
 * outright with `transaction_default_checkout_url_not_set`. Both are treated as
 * "not connected" by the caller rather than as a crash.
 *
 * We deliberately do NOT send `checkout.url` in the request. Doing so points the
 * checkout at our own domain, which requires Paddle.js on that page and, in live
 * mode, an approved domain. Neither exists here yet.
 *
 * `custom_data.organization_id` is the only thread tying the payment back to a
 * tenant: the webhook reads it to know whose plan to activate.
 */
export async function createPaddleTransactionCheckout(
  config: PaddleConfig,
  input: {
    priceId: string;
    organizationId: string;
    actorId: string;
    customerId?: string | null;
  },
): Promise<{ transactionId: string; url: string | null }> {
  const data = await paddleFetch<TransactionResponse>(config, "/transactions", {
    method: "POST",
    body: {
      items: [{ price_id: input.priceId, quantity: 1 }],
      ...(input.customerId ? { customer_id: input.customerId } : {}),
      custom_data: {
        organization_id: input.organizationId,
        actor_id: input.actorId,
      },
    },
  });

  return { transactionId: data.id, url: data.checkout?.url ?? null };
}

type PortalSessionResponse = {
  urls?: {
    general?: { overview?: string | null } | null;
  } | null;
};

/**
 * Creates an authenticated customer-portal session.
 *
 * Paddle's portal links are short-lived and single-customer. They must never be
 * cached or shared: a fresh session is created per click.
 *
 * @see https://developer.paddle.com/build/customers/integrate-customer-portal
 */
export async function createPaddlePortalSession(
  config: PaddleConfig,
  input: { customerId: string; subscriptionIds?: string[] },
): Promise<{ url: string | null }> {
  const data = await paddleFetch<PortalSessionResponse>(
    config,
    `/customers/${encodeURIComponent(input.customerId)}/portal-sessions`,
    {
      method: "POST",
      // Up to 25 subscription ids may be passed to get per-subscription deep
      // links. We only need the overview, but passing the ids keeps the portal
      // scoped to this organization's subscriptions.
      body: input.subscriptionIds?.length ? { subscription_ids: input.subscriptionIds.slice(0, 25) } : {},
    },
  );

  return { url: data.urls?.general?.overview ?? null };
}
