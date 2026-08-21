import type { TasksApplication } from "./index";
import type { TasksHttpRequest } from "./http";

/** Dispatch a validated wire request onto one bound Tasks application. */
export async function executeTasksRequest(
  application: TasksApplication,
  request: TasksHttpRequest,
): Promise<unknown> {
  switch (request.operation) {
    case "getTask":
      return application.getTask(request.input.taskId);
    case "listTasks":
      return application.listTasks(request.input);
    case "createStandardTask":
      return application.createStandardTask(request.input);
    case "createGeneratedTask":
      return application.createGeneratedTask(request.input);
    case "updateGeneratedTaskDueDate":
      return application.updateGeneratedTaskDueDate(request.input);
    case "retireGeneratedTasks":
      return application.retireGeneratedTasks(request.input);
  }
}
