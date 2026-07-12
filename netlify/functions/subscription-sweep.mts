/**
 * Netlify Scheduled Function — subscription payment-cycle sweep.
 * Thin wrapper over the CRON_SECRET-gated route; see ../lib/trigger-cron.
 */
import { triggerCron } from "../lib/trigger-cron";

export const config = {
  // 03:30 UTC daily (matches the former vercel.json schedule).
  schedule: "30 3 * * *",
};

const handler = () => triggerCron("subscription-sweep");
export default handler;
