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

export interface CanonicalStateOptions {
  /**
   * The obligation's own date (ISO `yyyy-mm-dd`). Two DB statuses are
   * date-ambiguous — `subscription_payment_cycles.planned` and
   * `todos.financial_status = 'open'` — because the contract defines `due` as
   * "the obligation is now owed (its date has arrived / a payment task is
   * open)". When the date is supplied, it decides between `planned` and `due`;
   * without it the surface's table default applies.
   */
  dueDate?: string | null;
  /** Injectable "today" (ISO `yyyy-mm-dd`) so callers/tests stay deterministic. */
  today?: string;
}

/** (surface, dbStatus) pairs whose canonical state depends on the date. */
function isDateAmbiguous(surface: FinancialSurface, dbStatus: string): boolean {
  return (
    (surface === "subscription_cycle" && dbStatus === "planned") ||
    (surface === "financial_task" && dbStatus === "open")
  );
}

/**
 * Map a surface's raw DB status onto the canonical vocabulary. Returns `null`
 * for an unknown value (caller should fall back to the raw string rather than
 * mislabel). Mirrors the mapping table in the contract exactly.
 *
 * This maps labels only — it reads no money and writes nothing. `paid` is
 * reported because a posted row already exists, never to imply one should.
 */
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
