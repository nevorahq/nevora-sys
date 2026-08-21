import "server-only";

import type { SubscriptionsApplication } from "@nevora/subscriptions-api";

export type SubscriptionsCutoverMode = "shadow" | "http-read" | "http";
export type SubscriptionsCutoverOutcome =
  | "matched"
  | "mismatched"
  | "shadow_failed"
  | "remote_read_fallback";

export interface SubscriptionsCutoverObservation {
  operation:
    | "getSubscriptions"
    | "getPaymentCycleByTaskId"
    | "getPaymentCycleByTransactionId";
  outcome: SubscriptionsCutoverOutcome;
  localSize?: number;
  remoteSize?: number;
  error?: string;
}

export interface SubscriptionsCutoverDependencies {
  mode: SubscriptionsCutoverMode;
  local: SubscriptionsApplication;
  remote: SubscriptionsApplication;
  shouldShadow?: () => boolean;
  scheduleShadow?: (callback: () => Promise<void>) => void;
  observe?: (observation: SubscriptionsCutoverObservation) => void;
}

/**
 * Safe staged cutover:
 * - shadow: local is authoritative; sampled remote reads are compared;
 * - http-read: remote reads with local fallback, local writes;
 * - http: remote reads with local fallback, remote writes without retry.
 *
 * Writes never auto-fallback after a remote attempt because a timeout can hide
 * a committed write; repeating locally could create a duplicate payment cycle
 * or task.
 */
export function createCutoverSubscriptionsApplication(
  dependencies: SubscriptionsCutoverDependencies,
): SubscriptionsApplication {
  const { mode, local, remote } = dependencies;
  const observe = dependencies.observe ?? (() => undefined);
  const shouldShadow = dependencies.shouldShadow ?? (() => true);

  async function shadowRead<T>(
    operation: SubscriptionsCutoverObservation["operation"],
    localRead: () => Promise<T>,
    remoteRead: () => Promise<T>,
  ): Promise<T> {
    const localResult = await localRead();
    if (!shouldShadow()) return localResult;

    const compare = async () => {
      try {
        const remoteResult = await remoteRead();
        observe({
          operation,
          outcome: canonicalJson(localResult) === canonicalJson(remoteResult)
            ? "matched"
            : "mismatched",
          localSize: resultSize(localResult),
          remoteSize: resultSize(remoteResult),
        });
      } catch (error) {
        observe({ operation, outcome: "shadow_failed", error: errorMessage(error) });
      }
    };

    if (dependencies.scheduleShadow) {
      dependencies.scheduleShadow(compare);
    } else {
      await compare();
    }
    return localResult;
  }

  async function remoteRead<T>(
    operation: SubscriptionsCutoverObservation["operation"],
    readRemote: () => Promise<T>,
    readLocal: () => Promise<T>,
  ): Promise<T> {
    try {
      return await readRemote();
    } catch (error) {
      observe({ operation, outcome: "remote_read_fallback", error: errorMessage(error) });
      return readLocal();
    }
  }

  const read = <T>(
    operation: SubscriptionsCutoverObservation["operation"],
    localRead: () => Promise<T>,
    remoteReadOperation: () => Promise<T>,
  ) => mode === "shadow"
    ? shadowRead(operation, localRead, remoteReadOperation)
    : remoteRead(operation, remoteReadOperation, localRead);

  const writes = mode === "http" ? remote : local;
  return {
    context: local.context,
    getSubscriptions: () =>
      read("getSubscriptions", () => local.getSubscriptions(), () => remote.getSubscriptions()),
    getPaymentCycleByTaskId: (taskId) =>
      read(
        "getPaymentCycleByTaskId",
        () => local.getPaymentCycleByTaskId(taskId),
        () => remote.getPaymentCycleByTaskId(taskId),
      ),
    getPaymentCycleByTransactionId: (transactionId) =>
      read(
        "getPaymentCycleByTransactionId",
        () => local.getPaymentCycleByTransactionId(transactionId),
        () => remote.getPaymentCycleByTransactionId(transactionId),
      ),
    createSubscriptionPaymentCycle: (input) => writes.createSubscriptionPaymentCycle(input),
    createSubscriptionPaymentTaskForCycle: (input) => writes.createSubscriptionPaymentTaskForCycle(input),
  };
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function resultSize(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  return value == null ? 0 : 1;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Subscriptions transport error";
}
