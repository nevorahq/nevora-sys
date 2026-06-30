import type { ZodError } from "zod";
import type { SettingsActionState } from "../types/settings.types";

export function zodActionError(error: ZodError): SettingsActionState {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_form");
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }
  return { fieldErrors };
}
