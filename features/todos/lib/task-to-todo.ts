import type { Task } from "@nevora/tasks-contracts";
import type { Todo } from "@/entities/todo/model";

/**
 * List rows come from the task_smart_list view, which denormalizes project
 * fields (project_name/color/status). Rebuild the nested `project` object the
 * UI expects and drop the flat helpers.
 */
export function taskToTodo(task: Task): Todo {
  const { project_name, project_color, project_status, ...row } = task;
  const projectId = task.project_id ?? null;
  const project = projectId
    ? {
        id: projectId,
        name: project_name ?? "",
        color: project_color ?? null,
        status: project_status ?? "active",
      }
    : null;
  return { ...(row as unknown as Todo), project };
}
