import { notFound } from "next/navigation";

/**
 * Paused / secondary modules that are hidden for the private beta.
 *
 * CRM and Booking are not part of the active beta surface. They are already
 * absent from the sidebar navigation, but their App Router routes remained
 * reachable by direct URL. Any org member (including a restricted / expired one)
 * could therefore still land on a paused-module page. This guard blocks those
 * routes at the server so a paused module cannot be reached — or used as a
 * mutation surface — during beta.
 *
 * A paused module can be re-enabled per environment by setting its feature flag
 * (e.g. `NEVORA_ENABLE_CRM=true`, `NEVORA_ENABLE_BOOKING=true`) without touching
 * code. Note the data layer is defense-in-depth already: CRM/Booking RLS gates
 * writes on `can_write_data()` (membership + `is_organization_writable`), so a
 * restricted org cannot mutate those tables even via a direct Supabase call.
 */
export type PausedModule = "crm" | "booking";

const FLAG_ENV: Record<PausedModule, string> = {
  crm: "NEVORA_ENABLE_CRM",
  booking: "NEVORA_ENABLE_BOOKING",
};

/** Whether a paused module has been explicitly re-enabled for this environment. */
export function isPausedModuleEnabled(module: PausedModule): boolean {
  const value = process.env[FLAG_ENV[module]];
  return value === "true" || value === "1";
}

/**
 * Server guard for a paused-module route/page: renders the standard not-found
 * page unless the module is explicitly enabled. Call at the top of the page
 * component (or layout) for CRM/Booking routes.
 */
export function assertPausedModuleEnabled(module: PausedModule): void {
  if (!isPausedModuleEnabled(module)) {
    notFound();
  }
}
