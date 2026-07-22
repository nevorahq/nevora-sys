/**
 * Netlify Scheduled Function — usage-counter reconciliation sweep.
 * Thin wrapper over the CRON_SECRET-gated route; see ../lib/trigger-cron.
 */
import { triggerCron } from "../lib/trigger-cron";

export const config = {
  // 05:15 UTC daily — after the nightly maintenance sweeps have settled.
  schedule: "15 5 * * *",
};

const handler = () => triggerCron("usage-reconcile");
export default handler;
