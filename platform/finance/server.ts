import "server-only";

import { headers } from "next/headers";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  signFinanceServiceToken,
  type FinanceApplication,
  type FinanceRequestContext,
} from "@nevora/finance-api";
import type { CurrentContext } from "@/lib/context/current-context";
import { logger } from "@/lib/observability/logger";
import {
  createMoneyAccount,
  findActiveMoneyAccountsByCurrency,
  findDuplicateTransaction,
  getAccounts,
} from "@/modules/moneyflow/server";
import { createHttpFinanceApplication, FinanceTransportError } from "./http";
import { createCutoverFinanceApplication, type FinanceCutoverObservation } from "./cutover";

export interface InProcessFinanceDependencies {
  supabase: SupabaseClient;
  currentContext: CurrentContext;
}

/** Map the root application's rich session object to the portable Finance identity. */
export function toFinanceRequestContext(ctx: CurrentContext): Readonly<FinanceRequestContext> {
  return Object.freeze({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    permissions: Object.freeze([...ctx.permissions]),
  });
}

/**
 * Current in-process transport adapter for Finance (Money).
 *
 * Mirrors `platform/tasks/server.ts` and `platform/subscriptions/server.ts`:
 * wires the ORIGINAL `@/modules/moneyflow/server` functions directly, not
 * `@nevora/finance-runtime` — that package is reserved for a future
 * `apps/finance` deployment, the same relationship `tasks-runtime` has to
 * `apps/tasks`. Keeping two live copies of the same logic in-process would be
 * the dual-write the ADR forbids.
 *
 * `findActiveMoneyAccountsByCurrency` returns a raw Postgrest
 * `{data, error}` shape locally; this adapter reshapes it to the port's
 * `{ok, ...}` result here (not in `@/modules/moneyflow/server`, which stays
 * unchanged) since `packages/finance-contracts` cannot depend on Supabase types.
 */
export function createInProcessFinanceApplication(
  dependencies: InProcessFinanceDependencies,
): FinanceApplication {
  const { supabase, currentContext } = dependencies;
  const context = toFinanceRequestContext(currentContext);

  return {
    context,
    getAccounts: () => getAccounts(context.organizationId),
    findActiveMoneyAccountsByCurrency: async (currency) => {
      const { data, error } = await findActiveMoneyAccountsByCurrency(supabase, context.organizationId, currency);
      if (error) return { ok: false, error: error.message ?? "Failed to look up accounts" };
      return { ok: true, accounts: data ?? [] };
    },
    createMoneyAccount: (input) => createMoneyAccount(supabase, currentContext, input),
    findDuplicateTransaction: (input) =>
      findDuplicateTransaction(supabase, { organizationId: context.organizationId, ...input }),
  };
}

export type FinanceTransportMode = "in-process" | "shadow" | "http-read" | "http";

/** Select the current transport without changing business callers. */
export async function getFinanceApplication(
  dependencies: InProcessFinanceDependencies,
): Promise<FinanceApplication> {
  const mode = resolveFinanceTransportMode(process.env.FINANCE_TRANSPORT);
  const local = createInProcessFinanceApplication(dependencies);
  if (mode === "in-process") return local;

  const requestHeaders = await headers();
  const baseUrl = resolveFinanceApiBaseUrl(requestHeaders);
  const serviceSecret = process.env.FINANCE_SERVICE_AUTH_SECRET?.trim();
  if (!serviceSecret) {
    throw new FinanceTransportError(
      "Finance HTTP transport requires FINANCE_SERVICE_AUTH_SECRET.",
    );
  }
  const context = toFinanceRequestContext(dependencies.currentContext);
  const remote = createHttpFinanceApplication({
    baseUrl,
    context,
    serviceTokenFactory: (request) =>
      signFinanceServiceToken({ context, operation: request.operation }, serviceSecret),
  });
  return createCutoverFinanceApplication({
    mode,
    local,
    remote,
    shouldShadow: mode === "shadow"
      ? createShadowSampler(resolveFinanceShadowReadPercent(process.env.FINANCE_SHADOW_READ_PERCENT))
      : undefined,
    scheduleShadow: mode === "shadow" ? (callback) => after(callback) : undefined,
    observe: logFinanceCutoverObservation,
  });
}

export function resolveFinanceTransportMode(value: string | undefined): FinanceTransportMode {
  if (!value || value === "in-process") return "in-process";
  if (value === "shadow" || value === "http-read" || value === "http") return value;
  throw new FinanceTransportError(`Unsupported FINANCE_TRANSPORT value: ${value}`);
}

export function resolveFinanceShadowReadPercent(value: string | undefined): number {
  if (!value?.trim()) return 100;
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new FinanceTransportError("FINANCE_SHADOW_READ_PERCENT must be between 0 and 100.");
  }
  return percent;
}

function createShadowSampler(percent: number): () => boolean {
  if (percent <= 0) return () => false;
  if (percent >= 100) return () => true;
  return () => Math.random() * 100 < percent;
}

function logFinanceCutoverObservation(observation: FinanceCutoverObservation): void {
  const fields = {
    operation: observation.operation,
    outcome: observation.outcome,
    localSize: observation.localSize,
    remoteSize: observation.remoteSize,
    error: observation.error,
  };
  if (observation.outcome === "matched") {
    logger.debug("finance.cutover.read", fields);
  } else {
    logger.warn("finance.cutover.read", fields);
  }
}

function resolveFinanceApiBaseUrl(requestHeaders: Headers): string {
  const configured =
    process.env.FINANCE_API_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured;

  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) throw new FinanceTransportError("Finance HTTP transport has no API base URL.");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}
