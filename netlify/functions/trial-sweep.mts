/**
 * Netlify Scheduled Function — trial expiry sweep.
 * Thin wrapper over the CRON_SECRET-gated route; see ../lib/trigger-cron.
 */
import { triggerCron } from "../lib/trigger-cron";

export const config = {
  // 03:45 UTC daily (matches the former vercel.json schedule).
  schedule: "45 3 * * *",
};

const handler = () => triggerCron("trial-sweep");
export default handler;
