/**
 * Canonical financial-state vocabulary (Sprint 4 — S4.2).
 *
 * The single source of truth in code for the contract in
 * `docs/contracts/financial-state-machine.md`. Every money-bearing surface keeps
 * its own DB status column; this maps each onto ONE canonical vocabulary so the
 * UI can label states consistently. It changes NO database value — it is a pure,
 * total mapping used at render time.
 *
 *   detected → needs_review → planned → due → paid | cancelled
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

/** The money-bearing surfaces, each with its own DB status column. */
export type FinancialSurface =
  | "transaction" // money_transactions.status
  | "subscription_cycle" // subscription_payment_cycles.status
  | "financial_task" // todos.financial_status
  | "suggestion"; // financial_suggestions.review_state

/**
 * Map a surface's raw DB status onto the canonical vocabulary. Returns `null`
 * for an unknown value (caller should fall back to the raw string rather than
 * mislabel). Mirrors the mapping table in the contract exactly.
 */
export function toCanonicalFinancialState(
  surface: FinancialSurface,
  dbStatus: string,
): CanonicalFinancialState | null {
  switch (surface) {
    case "transaction":
      // money_transactions.status (041): posted = the ledger fact.
      if (dbStatus === "posted") return "paid";
      if (dbStatus === "planned") return "planned";
      return null;

    case "subscription_cycle":
      // subscription_payment_cycles.status (078)
      switch (dbStatus) {
        case "planned": return "planned";
        case "task_open": return "due";
        case "failed": return "due"; // attempt failed; still owed
        case "paid": return "paid";
        case "skipped": return "cancelled";
        case "cancelled": return "cancelled";
        default: return null;
      }

    case "financial_task":
      // todos.financial_status (079)
      switch (dbStatus) {
        case "open": return "due"; // an active obligation to pay
        case "paid": return "paid";
        case "skipped": return "cancelled";
        case "dismissed": return "cancelled";
        default: return null;
      }

    case "suggestion":
      // financial_suggestions.review_state (097)
      switch (dbStatus) {
        case "detected": return "detected";
        case "suggested": return "needs_review";
        case "waiting_confirmation": return "needs_review";
        // Confirmed exits the review machine: the obligation now lives on the
        // resulting transaction/task, whose surface tracks paid/due. We floor it
        // at `planned` here rather than overclaim `paid`.
        case "confirmed": return "planned";
        case "rejected": return "cancelled";
        default: return null;
      }
  }
}
