import {
  TASKS_HTTP_ENDPOINT,
  TASKS_HTTP_TRANSPORT_HEADER,
  TASKS_HTTP_TRANSPORT_VERSION,
  signTasksServiceToken,
  type TasksRequestContext,
} from "@nevora/tasks-api";
import type { GeneratedTaskMutationResult } from "@nevora/tasks-contracts";

export interface TasksClientEnvironment {
  baseUrl: string;
  serviceAuthSecret: string;
}

export class TasksClientError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "TasksClientError";
    this.status = status;
  }
}

interface TasksHttpEnvelope {
  ok: boolean;
  data?: unknown;
  error?: string;
}

/**
 * The one Tasks operation this deployment needs: provisioning the per-period
 * payment task. Deliberately a minimal, single-operation client rather than a
 * full `TasksApplication` HTTP adapter — that generic adapter lives in the
 * root app's `platform/tasks/http.ts`, which `apps/subscriptions` cannot
 * import (a `@/` alias belonging to a different deployment). Subscriptions
 * never needs Tasks' other seven operations, so building a full port here
 * would be speculative surface this deployment cannot exercise.
 */
export async function createGeneratedTaskViaTasksService(
  context: Readonly<TasksRequestContext>,
  input: { title: string; dueDate: string },
  environment: TasksClientEnvironment,
): Promise<GeneratedTaskMutationResult> {
  const endpoint = new URL(TASKS_HTTP_ENDPOINT, ensureTrailingSlash(environment.baseUrl));
  // Matches the wire schema exactly: workspaceId is never sent — the remote
  // side derives it from the signed context, the same way the in-process
  // adapter overrides any caller-supplied workspaceId with its own context.
  const payload = { operation: "createGeneratedTask" as const, input };
  const token = signTasksServiceToken(
    { context, operation: "createGeneratedTask" },
    environment.serviceAuthSecret,
  );

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "content-type": "application/json",
        [TASKS_HTTP_TRANSPORT_HEADER]: TASKS_HTTP_TRANSPORT_VERSION,
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new TasksClientError("Tasks API is unavailable.");
  }

  let body: TasksHttpEnvelope | null = null;
  try {
    body = (await response.json()) as TasksHttpEnvelope;
  } catch {
    throw new TasksClientError("Tasks API returned an invalid response.", response.status);
  }

  if (!response.ok || !body.ok) {
    const message = !body.ok ? (body.error ?? "Tasks API request failed.") : `Tasks API request failed (${response.status}).`;
    throw new TasksClientError(message, response.status);
  }
  return body.data as GeneratedTaskMutationResult;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
