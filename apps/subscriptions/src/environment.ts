export interface SubscriptionsRuntimeEnvironment {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  serviceAuthSecret: string;
  /** Base URL of the Tasks service this deployment calls to provision payment tasks. */
  tasksApiUrl: string;
  /** Shared with Tasks; signs the outbound service token — see src/effects.ts. */
  tasksServiceAuthSecret: string;
}

export class SubscriptionsRuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionsRuntimeConfigurationError";
  }
}

export function readSubscriptionsRuntimeEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): SubscriptionsRuntimeEnvironment {
  const supabaseUrl = source.SUPABASE_URL?.trim() ?? "";
  const supabaseServiceRoleKey = source.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const serviceAuthSecret = source.SUBSCRIPTIONS_SERVICE_AUTH_SECRET?.trim() ?? "";
  const tasksApiUrl = source.TASKS_API_URL?.trim() ?? "";
  const tasksServiceAuthSecret = source.TASKS_SERVICE_AUTH_SECRET?.trim() ?? "";

  if (!isHttpUrl(supabaseUrl)) {
    throw new SubscriptionsRuntimeConfigurationError("SUPABASE_URL is not configured.");
  }
  if (!supabaseServiceRoleKey) {
    throw new SubscriptionsRuntimeConfigurationError("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  if (serviceAuthSecret.length < 32) {
    throw new SubscriptionsRuntimeConfigurationError("SUBSCRIPTIONS_SERVICE_AUTH_SECRET is not configured.");
  }
  if (!isHttpUrl(tasksApiUrl)) {
    throw new SubscriptionsRuntimeConfigurationError("TASKS_API_URL is not configured.");
  }
  if (tasksServiceAuthSecret.length < 32) {
    throw new SubscriptionsRuntimeConfigurationError("TASKS_SERVICE_AUTH_SECRET is not configured.");
  }
  return { supabaseUrl, supabaseServiceRoleKey, serviceAuthSecret, tasksApiUrl, tasksServiceAuthSecret };
}

export function isSubscriptionsRuntimeReady(source: NodeJS.ProcessEnv = process.env): boolean {
  try {
    readSubscriptionsRuntimeEnvironment(source);
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
