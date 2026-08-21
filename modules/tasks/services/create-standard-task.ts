import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { createStandardTask as createRuntimeStandardTask } from "@nevora/tasks-runtime";
import type {
  CreateStandardTaskInput,
  CreateStandardTaskResult,
} from "@nevora/tasks-contracts";
import {
  createRootTasksRuntimeEffects,
  toTasksRuntimeContext,
} from "./runtime-adapter";

export type { CreateStandardTaskInput, CreateStandardTaskResult } from "@nevora/tasks-contracts";

/** Compatibility adapter over the extracted Supabase-backed Tasks runtime. */
export function createStandardTask(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: CreateStandardTaskInput,
): Promise<CreateStandardTaskResult> {
  return createRuntimeStandardTask(
    supabase,
    toTasksRuntimeContext(ctx),
    createRootTasksRuntimeEffects(ctx),
    input,
  );
}
