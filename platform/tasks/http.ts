import "server-only";

import type { TasksApplication, TasksRequestContext } from "@nevora/tasks-api";
import {
  TASKS_HTTP_ENDPOINT,
  TASKS_HTTP_TRANSPORT_HEADER,
  TASKS_HTTP_TRANSPORT_VERSION,
  type TasksHttpRequest,
  type TasksHttpResponse,
} from "@nevora/tasks-api";

export interface HttpTasksDependencies {
  baseUrl: string;
  cookieHeader?: string;
  serviceTokenFactory?: (request: TasksHttpRequest) => string | Promise<string>;
  context: Readonly<TasksRequestContext>;
  fetchImplementation?: typeof fetch;
}

export class TasksTransportError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "TasksTransportError";
    this.status = status;
  }
}

/** Authenticated HTTP implementation of the portable Tasks API. */
export function createHttpTasksApplication(
  dependencies: HttpTasksDependencies,
): TasksApplication {
  const endpoint = new URL(TASKS_HTTP_ENDPOINT, ensureTrailingSlash(dependencies.baseUrl));
  const fetchImplementation = dependencies.fetchImplementation ?? fetch;

  async function send<T>(payload: TasksHttpRequest): Promise<T> {
    if (!dependencies.cookieHeader && !dependencies.serviceTokenFactory) {
      throw new TasksTransportError("Tasks HTTP transport has no authentication method.");
    }
    const serviceToken = dependencies.serviceTokenFactory
      ? await dependencies.serviceTokenFactory(payload)
      : null;
    const requestHeaders: Record<string, string> = {
      "content-type": "application/json",
      [TASKS_HTTP_TRANSPORT_HEADER]: TASKS_HTTP_TRANSPORT_VERSION,
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
      throw new TasksTransportError("Tasks API is unavailable.");
    }

    let body: TasksHttpResponse<T> | null = null;
    try {
      body = (await response.json()) as TasksHttpResponse<T>;
    } catch {
      throw new TasksTransportError("Tasks API returned an invalid response.", response.status);
    }

    if (!response.ok || !body.ok) {
      const message = body && !body.ok ? body.error : `Tasks API request failed (${response.status}).`;
      throw new TasksTransportError(message, response.status);
    }
    return body.data;
  }

  return {
    context: dependencies.context,
    getTask: (taskId) => send({ operation: "getTask", input: { taskId } }),
    listTasks: (input = {}) => send({ operation: "listTasks", input }),
    createStandardTask: (input) => send({ operation: "createStandardTask", input }),
    createGeneratedTask: (input) =>
      send({
        operation: "createGeneratedTask",
        input: { title: input.title, dueDate: input.dueDate },
      }),
    updateGeneratedTaskDueDate: (input) =>
      send({ operation: "updateGeneratedTaskDueDate", input }),
    retireGeneratedTasks: (input) => send({ operation: "retireGeneratedTasks", input }),
  };
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
