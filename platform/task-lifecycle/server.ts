import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import type {
  CreateGeneratedTaskInput,
  GeneratedTaskMutationResult,
  RetireGeneratedTasksInput,
  UpdateGeneratedTaskDueDateInput,
} from "@nevora/tasks-contracts";
import { getTasksApplication } from "@/platform/tasks/server";

/**
 * Transport seam for generated Tasks. A standalone Tasks application can replace
 * these in-process calls with HTTP/queue adapters without changing Subscriptions.
 */
export async function createGeneratedTaskRecord(
  params: CreateGeneratedTaskInput & { supabase: SupabaseClient; ctx: CurrentContext },
): Promise<GeneratedTaskMutationResult> {
  const { supabase, ctx, ...input } = params;
  return (await getTasksApplication({ supabase, currentContext: ctx })).createGeneratedTask(input);
}

export async function updateGeneratedTaskDueDate(
  params: UpdateGeneratedTaskDueDateInput & { supabase: SupabaseClient; ctx: CurrentContext },
): Promise<boolean> {
  const { supabase, ctx, ...input } = params;
  return (await getTasksApplication({ supabase, currentContext: ctx }))
    .updateGeneratedTaskDueDate(input);
}

export async function retireGeneratedTasks(
  params: RetireGeneratedTasksInput & { supabase: SupabaseClient; ctx: CurrentContext },
): Promise<number> {
  const { supabase, ctx, ...input } = params;
  return (await getTasksApplication({ supabase, currentContext: ctx })).retireGeneratedTasks(input);
}
