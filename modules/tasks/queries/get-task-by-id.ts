import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTask } from "@nevora/tasks-runtime";
import { createClient } from "@/lib/supabase/server";
import type { TaskWithDetails } from "../types/task.types";

export async function getTaskById(
  orgId: string,
  taskId: string,
  client?: SupabaseClient,
): Promise<TaskWithDetails | null> {
  const supabase = client ?? await createClient();
  return getTask(supabase, orgId, undefined, taskId) as Promise<TaskWithDetails | null>;
}
