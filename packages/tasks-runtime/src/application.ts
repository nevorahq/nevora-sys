import type { SupabaseClient } from "@supabase/supabase-js";
import type { TasksApplication, TasksRequestContext } from "@nevora/tasks-api";
import type { TasksRuntimeEffects } from "./effects";
import {
  createFinancialTask,
  createGeneratedTask,
  createStandardTask,
  retireGeneratedTasks,
  updateGeneratedTaskDueDate,
} from "./mutations";
import { getTask, hasPaidTaskForTransaction, listTasks } from "./queries";

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
    getTask: (taskId) =>
      getTask(supabase, context.organizationId, context.workspaceId, taskId),
    listTasks: (input = {}) =>
      listTasks(supabase, context.organizationId, context.workspaceId, input),
    hasPaidTaskForTransaction: (transactionId) =>
      hasPaidTaskForTransaction(
        supabase,
        context.organizationId,
        transactionId,
        context.workspaceId,
      ),
    createStandardTask: (input) =>
      createStandardTask(supabase, context, effects, input),
    createFinancialTask: (input) =>
      createFinancialTask(supabase, context, effects, input),
    createGeneratedTask: (input) => createGeneratedTask(supabase, context, input),
    updateGeneratedTaskDueDate: (input) =>
      updateGeneratedTaskDueDate(supabase, context, input),
    retireGeneratedTasks: (input) => retireGeneratedTasks(supabase, context, input),
  };
}
