/**
 * Workspace contract shared by every product that displays a financial state.
 *
 * Product modules keep their own persistence statuses. This platform contract
 * only normalizes those statuses for consistent presentation; it performs no
 * reads or writes.
 */
export const CANONICAL_FINANCIAL_STATES = [
  "detected",
  "needs_review",
  "planned",
  "due",
  "paid",
  "cancelled",
] as const;

export type CanonicalFinancialState = (typeof CANONICAL_FINANCIAL_STATES)[number];

export type FinancialSurface =
  | "transaction"
  | "subscription_cycle"
  | "financial_task"
  | "suggestion";

export interface CanonicalStateOptions {
  dueDate?: string | null;
  today?: string;
}

function isDateAmbiguous(surface: FinancialSurface, dbStatus: string): boolean {
  return (
    (surface === "subscription_cycle" && dbStatus === "planned") ||
    (surface === "financial_task" && dbStatus === "open")
  );
}

export function toCanonicalFinancialState(
  surface: FinancialSurface,
  dbStatus: string,
  opts?: CanonicalStateOptions,
): CanonicalFinancialState | null {
  if (opts?.dueDate && isDateAmbiguous(surface, dbStatus)) {
    const today = opts.today ?? new Date().toISOString().slice(0, 10);
    return opts.dueDate <= today ? "due" : "planned";
  }

  switch (surface) {
    case "transaction":
      if (dbStatus === "posted") return "paid";
      if (dbStatus === "planned") return "planned";
      return null;

    case "subscription_cycle":
      switch (dbStatus) {
        case "planned": return "planned";
        case "task_open": return "due";
        case "failed": return "due";
        case "paid": return "paid";
        case "skipped": return "cancelled";
        case "cancelled": return "cancelled";
        default: return null;
      }

    case "financial_task":
      switch (dbStatus) {
        case "open": return "due";
        case "paid": return "paid";
        case "skipped": return "cancelled";
        case "dismissed": return "cancelled";
        default: return null;
      }

    case "suggestion":
      switch (dbStatus) {
        case "detected": return "detected";
        case "suggested": return "needs_review";
        case "waiting_confirmation": return "needs_review";
        case "confirmed": return "planned";
        case "rejected": return "cancelled";
        default: return null;
      }
  }
}
