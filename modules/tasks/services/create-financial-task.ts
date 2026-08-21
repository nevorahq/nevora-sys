import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { createFinancialTask as createRuntimeFinancialTask } from "@nevora/tasks-runtime";
import type {
  CreateFinancialTaskCommand,
  CreateFinancialTaskResult,
} from "@nevora/tasks-contracts";
import {
  createRootTasksRuntimeEffects,
  toTasksRuntimeContext,
} from "./runtime-adapter";

export type {
  CreateFinancialTaskCommand as CreateFinancialTaskInput,
  CreateFinancialTaskResult,
} from "@nevora/tasks-contracts";

/** Compatibility adapter over the extracted Supabase-backed Tasks runtime. */
export function createFinancialTask(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: CreateFinancialTaskCommand,
): Promise<CreateFinancialTaskResult> {
  return createRuntimeFinancialTask(
    supabase,
    toTasksRuntimeContext(ctx),
    createRootTasksRuntimeEffects(ctx),
    input,
  );
}
