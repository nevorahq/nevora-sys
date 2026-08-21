import "server-only";

import { headers } from "next/headers";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  signSubscriptionsServiceToken,
  type SubscriptionsApplication,
  type SubscriptionsRequestContext,
} from "@nevora/subscriptions-api";
import type { CurrentContext } from "@/lib/context/current-context";
import { logger } from "@/lib/observability/logger";
import {
  createSubscriptionPaymentCycle,
  createSubscriptionPaymentTaskForCycle,
  getPaymentCycleByTaskId,
  getPaymentCycleByTransactionId,
  getSubscriptions,
} from "@/modules/subtracker/server";
import { createHttpSubscriptionsApplication, SubscriptionsTransportError } from "./http";
import {
  createCutoverSubscriptionsApplication,
  type SubscriptionsCutoverObservation,
} from "./cutover";

export interface InProcessSubscriptionsDependencies {
  supabase: SupabaseClient;
  currentContext: CurrentContext;
}

/** Map the root application's rich session object to the portable Subscriptions identity. */
export function toSubscriptionsRequestContext(ctx: CurrentContext): Readonly<SubscriptionsRequestContext> {
  return Object.freeze({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    permissions: Object.freeze([...ctx.permissions]),
  });
}

/**
 * Current in-process transport adapter for Subscriptions.
 *
 * Callers depend on the framework-neutral `SubscriptionsApplication`; only
 * this adapter knows about Supabase, CurrentContext and the root product
 * implementation. Mirrors `platform/tasks/server.ts` exactly, including its
 * one non-obvious property: this wires the ORIGINAL `@/modules/subtracker/server`
 * functions (already battle-tested, unchanged), not `@nevora/subscriptions-runtime`.
 * That package is a from-scratch reimplementation reserved for a future
 * `apps/subscriptions` deployment to consume — the same relationship
 * `@nevora/tasks-runtime` has to `apps/tasks` today (the root app's in-process
 * Tasks adapter doesn't consume it either). Keeping two copies of the same
 * business logic in-process would be the dual-write the ADR forbids; there is
 * exactly one implementation live at any moment, selected by deployment.
 */
export function createInProcessSubscriptionsApplication(
  dependencies: InProcessSubscriptionsDependencies,
): SubscriptionsApplication {
  const { supabase, currentContext } = dependencies;
  const context = toSubscriptionsRequestContext(currentContext);

  return {
    context,
    getSubscriptions: () => getSubscriptions(context.organizationId),
    getPaymentCycleByTaskId: (taskId) => getPaymentCycleByTaskId(context.organizationId, taskId),
    getPaymentCycleByTransactionId: (transactionId) =>
      getPaymentCycleByTransactionId(context.organizationId, transactionId),
    createSubscriptionPaymentCycle: (input) =>
      createSubscriptionPaymentCycle({ supabase, ctx: currentContext, ...input }),
    createSubscriptionPaymentTaskForCycle: (input) =>
      createSubscriptionPaymentTaskForCycle({ supabase, ctx: currentContext, ...input }),
  };
}

export type SubscriptionsTransportMode = "in-process" | "shadow" | "http-read" | "http";

/** Select the current transport without changing business callers. */
export async function getSubscriptionsApplication(
  dependencies: InProcessSubscriptionsDependencies,
): Promise<SubscriptionsApplication> {
  const mode = resolveSubscriptionsTransportMode(process.env.SUBSCRIPTIONS_TRANSPORT);
  const local = createInProcessSubscriptionsApplication(dependencies);
  if (mode === "in-process") return local;

  const requestHeaders = await headers();
  const baseUrl = resolveSubscriptionsApiBaseUrl(requestHeaders);
  const serviceSecret = process.env.SUBSCRIPTIONS_SERVICE_AUTH_SECRET?.trim();
  if (!serviceSecret) {
    throw new SubscriptionsTransportError(
      "Subscriptions HTTP transport requires SUBSCRIPTIONS_SERVICE_AUTH_SECRET.",
    );
  }
  const context = toSubscriptionsRequestContext(dependencies.currentContext);
  const remote = createHttpSubscriptionsApplication({
    baseUrl,
    context,
    serviceTokenFactory: (request) =>
      signSubscriptionsServiceToken({ context, operation: request.operation }, serviceSecret),
  });
  return createCutoverSubscriptionsApplication({
    mode,
    local,
    remote,
    shouldShadow: mode === "shadow"
      ? createShadowSampler(resolveSubscriptionsShadowReadPercent(process.env.SUBSCRIPTIONS_SHADOW_READ_PERCENT))
      : undefined,
    scheduleShadow: mode === "shadow" ? (callback) => after(callback) : undefined,
    observe: logSubscriptionsCutoverObservation,
  });
}

export function resolveSubscriptionsTransportMode(value: string | undefined): SubscriptionsTransportMode {
  if (!value || value === "in-process") return "in-process";
  if (value === "shadow" || value === "http-read" || value === "http") return value;
  throw new SubscriptionsTransportError(`Unsupported SUBSCRIPTIONS_TRANSPORT value: ${value}`);
}

export function resolveSubscriptionsShadowReadPercent(value: string | undefined): number {
  if (!value?.trim()) return 100;
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new SubscriptionsTransportError("SUBSCRIPTIONS_SHADOW_READ_PERCENT must be between 0 and 100.");
  }
  return percent;
}

function createShadowSampler(percent: number): () => boolean {
  if (percent <= 0) return () => false;
  if (percent >= 100) return () => true;
  return () => Math.random() * 100 < percent;
}

function logSubscriptionsCutoverObservation(observation: SubscriptionsCutoverObservation): void {
  const fields = {
    operation: observation.operation,
    outcome: observation.outcome,
    localSize: observation.localSize,
    remoteSize: observation.remoteSize,
    error: observation.error,
  };
  if (observation.outcome === "matched") {
    logger.debug("subscriptions.cutover.read", fields);
  } else {
    logger.warn("subscriptions.cutover.read", fields);
  }
}

function resolveSubscriptionsApiBaseUrl(requestHeaders: Headers): string {
  const configured =
    process.env.SUBSCRIPTIONS_API_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured;

  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) throw new SubscriptionsTransportError("Subscriptions HTTP transport has no API base URL.");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}
