import "server-only";

import { headers } from "next/headers";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  signTasksServiceToken,
  type TasksApplication,
  type TasksRequestContext,
} from "@nevora/tasks-api";
import type { CurrentContext } from "@/lib/context/current-context";
import { logger } from "@/lib/observability/logger";
import {
  createGeneratedTaskRecord,
  createStandardTask,
  getTaskById,
  getTasks,
  retireGeneratedTasks,
  updateGeneratedTaskDueDate,
} from "@/modules/tasks/server";
import { createHttpTasksApplication, TasksTransportError } from "./http";
import {
  createCutoverTasksApplication,
  type TasksCutoverObservation,
} from "./cutover";

export interface InProcessTasksDependencies {
  supabase: SupabaseClient;
  currentContext: CurrentContext;
}

/** Map the root application's rich session object to the portable Tasks identity. */
export function toTasksRequestContext(ctx: CurrentContext): Readonly<TasksRequestContext> {
  return Object.freeze({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    permissions: Object.freeze([...ctx.permissions]),
  });
}

/**
 * Current in-process transport adapter for Tasks.
 *
 * Callers depend on the framework-neutral `TasksApplication`; only this adapter
 * knows about Supabase, CurrentContext and the root product implementation.
 * A future HTTP adapter can replace this file without changing those callers.
 */
export function createInProcessTasksApplication(
  dependencies: InProcessTasksDependencies,
): TasksApplication {
  const { supabase, currentContext } = dependencies;
  const context = toTasksRequestContext(currentContext);

  return {
    context,
    getTask: (taskId) => getTaskById(context.organizationId, taskId, supabase),
    listTasks: (input = {}) =>
      getTasks(
        context.organizationId,
        { ...input, workspaceId: context.workspaceId },
        supabase,
      ),
    createStandardTask: (input) => createStandardTask(supabase, currentContext, input),
    createGeneratedTask: (input) =>
      createGeneratedTaskRecord({
        supabase,
        ctx: currentContext,
        ...input,
        workspaceId: context.workspaceId,
      }),
    updateGeneratedTaskDueDate: (input) =>
      updateGeneratedTaskDueDate({ supabase, ctx: currentContext, ...input }),
    retireGeneratedTasks: (input) =>
      retireGeneratedTasks({ supabase, ctx: currentContext, ...input }),
  };
}

export type TasksTransportMode = "in-process" | "shadow" | "http-read" | "http";

/** Select the current transport without changing business callers. */
export async function getTasksApplication(
  dependencies: InProcessTasksDependencies,
): Promise<TasksApplication> {
  const mode = resolveTasksTransportMode(process.env.TASKS_TRANSPORT);
  const local = createInProcessTasksApplication(dependencies);
  if (mode === "in-process") return local;

  const requestHeaders = await headers();
  const baseUrl = resolveTasksApiBaseUrl(requestHeaders);
  const serviceSecret = process.env.TASKS_SERVICE_AUTH_SECRET?.trim();
  if (!serviceSecret) {
    throw new TasksTransportError(
      "Tasks HTTP transport requires TASKS_SERVICE_AUTH_SECRET.",
    );
  }
  const context = toTasksRequestContext(dependencies.currentContext);
  const remote = createHttpTasksApplication({
    baseUrl,
    context,
    serviceTokenFactory: (request) =>
      signTasksServiceToken({ context, operation: request.operation }, serviceSecret),
  });
  return createCutoverTasksApplication({
    mode,
    local,
    remote,
    shouldShadow: mode === "shadow"
      ? createShadowSampler(resolveTasksShadowReadPercent(process.env.TASKS_SHADOW_READ_PERCENT))
      : undefined,
    scheduleShadow: mode === "shadow" ? (callback) => after(callback) : undefined,
    observe: logTasksCutoverObservation,
  });
}

export function resolveTasksTransportMode(value: string | undefined): TasksTransportMode {
  if (!value || value === "in-process") return "in-process";
  if (value === "shadow" || value === "http-read" || value === "http") return value;
  throw new TasksTransportError(`Unsupported TASKS_TRANSPORT value: ${value}`);
}

export function resolveTasksShadowReadPercent(value: string | undefined): number {
  if (!value?.trim()) return 100;
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new TasksTransportError("TASKS_SHADOW_READ_PERCENT must be between 0 and 100.");
  }
  return percent;
}

function createShadowSampler(percent: number): () => boolean {
  if (percent <= 0) return () => false;
  if (percent >= 100) return () => true;
  return () => Math.random() * 100 < percent;
}

function logTasksCutoverObservation(observation: TasksCutoverObservation): void {
  const fields = {
    operation: observation.operation,
    outcome: observation.outcome,
    localSize: observation.localSize,
    remoteSize: observation.remoteSize,
    error: observation.error,
  };
  if (observation.outcome === "matched") {
    logger.debug("tasks.cutover.read", fields);
  } else {
    logger.warn("tasks.cutover.read", fields);
  }
}

function resolveTasksApiBaseUrl(requestHeaders: Headers): string {
  const configured =
    process.env.TASKS_API_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured;

  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) throw new TasksTransportError("Tasks HTTP transport has no API base URL.");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}
