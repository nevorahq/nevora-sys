export interface TasksRuntimeEnvironment {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  serviceAuthSecret: string;
}

export class TasksRuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TasksRuntimeConfigurationError";
  }
}

export function readTasksRuntimeEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): TasksRuntimeEnvironment {
  const supabaseUrl = source.SUPABASE_URL?.trim() ?? "";
  const supabaseServiceRoleKey = source.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const serviceAuthSecret = source.TASKS_SERVICE_AUTH_SECRET?.trim() ?? "";

  if (!isHttpUrl(supabaseUrl)) {
    throw new TasksRuntimeConfigurationError("SUPABASE_URL is not configured.");
  }
  if (!supabaseServiceRoleKey) {
    throw new TasksRuntimeConfigurationError("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  if (serviceAuthSecret.length < 32) {
    throw new TasksRuntimeConfigurationError("TASKS_SERVICE_AUTH_SECRET is not configured.");
  }
  return { supabaseUrl, supabaseServiceRoleKey, serviceAuthSecret };
}

export function isTasksRuntimeReady(source: NodeJS.ProcessEnv = process.env): boolean {
  try {
    readTasksRuntimeEnvironment(source);
    return true;
  } catch {
    return false;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
