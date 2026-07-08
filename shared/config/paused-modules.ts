import { notFound } from "next/navigation";
import { NextResponse } from "next/server";

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
 * A paused module has THREE distinct server surfaces, and hiding the page is
 * only one of them. Each needs its own guard because each fails differently:
 *
 *   1. Pages / layouts   → `assertPausedModuleEnabled()`  (renders not-found)
 *   2. Server Actions    → `assertPausedModuleAction()`   (throws PausedModuleError)
 *   3. Route handlers    → `pausedModuleGuard()`          (returns a 404 Response)
 *
 * Server Actions are the subtle one: a `"use server"` export stays reachable
 * over POST even when every page that renders its form returns 404, so gating
 * the page alone leaves a live mutation surface for a paused module.
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

/**
 * Thrown by `assertPausedModuleAction()` when a paused module's Server Action is
 * invoked while the module is disabled. A distinct class so callers/tests can
 * assert on it instead of string-matching a generic Error.
 */
export class PausedModuleError extends Error {
  readonly module: PausedModule;

  constructor(module: PausedModule) {
    super(`Module "${module}" is paused and cannot be used.`);
    this.name = "PausedModuleError";
    this.module = module;
  }
}

/**
 * Server guard for a paused-module Server Action.
 *
 * Deliberately throws instead of calling `notFound()`: `notFound()` is a
 * *rendering* construct — per the Next.js docs it "terminates rendering of the
 * route segment in which it was thrown" — and a Server Action invoked over POST
 * has no route segment to terminate. Throwing keeps the behaviour deterministic
 * (the action rejects, no mutation runs) and testable without a Next runtime.
 *
 * Call as the FIRST statement of the action, before `requireOrg()` and before
 * any read of the request payload.
 */
export function assertPausedModuleAction(module: PausedModule): void {
  if (!isPausedModuleEnabled(module)) {
    throw new PausedModuleError(module);
  }
}

/**
 * Server guard for a paused-module Route Handler.
 *
 * Returns a 404 `Response` to return early, or `null` when the module is
 * enabled and the handler should proceed. A 404 (not 403) so a paused module is
 * indistinguishable from a route that was never deployed.
 *
 *   const paused = pausedModuleGuard("booking");
 *   if (paused) return paused;
 */
export function pausedModuleGuard(module: PausedModule): NextResponse | null {
  if (isPausedModuleEnabled(module)) return null;
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}
