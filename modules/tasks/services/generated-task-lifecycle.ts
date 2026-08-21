import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import {
  createGeneratedTask,
  hasPaidTaskForTransaction as runtimeHasPaidTaskForTransaction,
  retireGeneratedTasks as runtimeRetireGeneratedTasks,
  updateGeneratedTaskDueDate as runtimeUpdateGeneratedTaskDueDate,
} from "@nevora/tasks-runtime";
import type {
  CreateGeneratedTaskInput,
  GeneratedTaskMutationResult,
  RetireGeneratedTasksInput,
  UpdateGeneratedTaskDueDateInput,
} from "@nevora/tasks-contracts";
import { toTasksRuntimeContext } from "./runtime-context";

export type { GeneratedTaskMutationResult } from "@nevora/tasks-contracts";

export function createGeneratedTaskRecord(
  params: CreateGeneratedTaskInput & { supabase: SupabaseClient; ctx: CurrentContext },
): Promise<GeneratedTaskMutationResult> {
  return createGeneratedTask(params.supabase, toTasksRuntimeContext(params.ctx), {
    title: params.title,
    dueDate: params.dueDate,
  });
}

export function updateGeneratedTaskDueDate(
  params: UpdateGeneratedTaskDueDateInput & { supabase: SupabaseClient; ctx: CurrentContext },
): Promise<boolean> {
  return runtimeUpdateGeneratedTaskDueDate(
    params.supabase,
    toTasksRuntimeContext(params.ctx),
    { taskId: params.taskId, dueDate: params.dueDate },
  );
}

export function retireGeneratedTasks(
  params: RetireGeneratedTasksInput & { supabase: SupabaseClient; ctx: CurrentContext },
): Promise<number> {
  return runtimeRetireGeneratedTasks(
    params.supabase,
    toTasksRuntimeContext(params.ctx),
    { taskIds: params.taskIds, retiredAt: params.retiredAt },
  );
}

export function hasPaidTaskForTransaction(params: {
  supabase: SupabaseClient;
  organizationId: string;
  transactionId: string;
}): Promise<boolean> {
  return runtimeHasPaidTaskForTransaction(
    params.supabase,
    params.organizationId,
    params.transactionId,
  );
}
