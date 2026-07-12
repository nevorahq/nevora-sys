/**
 * Netlify Scheduled Function — nightly trigger for the account-deletion purge.
 * Thin wrapper over the CRON_SECRET-gated route; see ../lib/trigger-cron.
 */
import { triggerCron } from "../lib/trigger-cron";

export const config = {
  // 04:00 UTC daily — an hour after the nightly sweeps, off-peak.
  schedule: "0 4 * * *",
};

const handler = () => triggerCron("purge-deleted-accounts");
export default handler;
