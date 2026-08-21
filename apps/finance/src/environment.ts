export interface FinanceRuntimeEnvironment {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  serviceAuthSecret: string;
}

export class FinanceRuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinanceRuntimeConfigurationError";
  }
}

export function readFinanceRuntimeEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): FinanceRuntimeEnvironment {
  const supabaseUrl = source.SUPABASE_URL?.trim() ?? "";
  const supabaseServiceRoleKey = source.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const serviceAuthSecret = source.FINANCE_SERVICE_AUTH_SECRET?.trim() ?? "";

  if (!isHttpUrl(supabaseUrl)) {
    throw new FinanceRuntimeConfigurationError("SUPABASE_URL is not configured.");
  }
  if (!supabaseServiceRoleKey) {
    throw new FinanceRuntimeConfigurationError("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  if (serviceAuthSecret.length < 32) {
    throw new FinanceRuntimeConfigurationError("FINANCE_SERVICE_AUTH_SECRET is not configured.");
  }
  return { supabaseUrl, supabaseServiceRoleKey, serviceAuthSecret };
}

export function isFinanceRuntimeReady(source: NodeJS.ProcessEnv = process.env): boolean {
  try {
    readFinanceRuntimeEnvironment(source);
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
