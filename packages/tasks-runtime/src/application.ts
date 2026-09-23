import type { SupabaseClient } from "@supabase/supabase-js";
import type { TasksApplication, TasksRequestContext } from "@nevora/tasks-api";
import type { TasksRuntimeEffects } from "./effects";
import {
  createGeneratedTask,
  createStandardTask,
  retireGeneratedTasks,
  updateGeneratedTaskDueDate,
} from "./mutations";
import { getTask, listTasks } from "./queries";

export interface TasksRuntimeDependencies {
  supabase: SupabaseClient;
  context: Readonly<TasksRequestContext>;
  effects: TasksRuntimeEffects;
}

/** Supabase-backed implementation shared by the root adapter and Tasks app. */
export function createTasksRuntimeApplication(
  dependencies: TasksRuntimeDependencies,
): TasksApplication {
  const { supabase, context, effects } = dependencies;
  return {
    context,
    // Organization-scoped, matching the in-process adapter: a task link must
    // open regardless of which workspace the task lives in.
    getTask: (taskId) =>
      getTask(supabase, context.organizationId, undefined, taskId),
    listTasks: (input = {}) =>
      listTasks(
        supabase,
        context.organizationId,
        input.scope === "organization" ? undefined : context.workspaceId,
        input,
      ),
    createStandardTask: (input) =>
      createStandardTask(supabase, context, effects, input),
    createGeneratedTask: (input) => createGeneratedTask(supabase, context, input),
    updateGeneratedTaskDueDate: (input) =>
      updateGeneratedTaskDueDate(supabase, context, input),
    retireGeneratedTasks: (input) => retireGeneratedTasks(supabase, context, input),
  };
}
