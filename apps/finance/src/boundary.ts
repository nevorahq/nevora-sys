import type { FinanceApplication } from "@nevora/finance-api";

/** Current readiness of this separately extractable application. */
export const FINANCE_EXTRACTION_STAGE = "standalone_runtime_ready" as const;

/**
 * Stable transport contract implemented by the standalone Finance runtime.
 */
export type FinanceApplicationBoundary = FinanceApplication;
