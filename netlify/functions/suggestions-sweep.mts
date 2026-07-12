/**
 * Netlify Scheduled Function — nightly sweep for stale AI suggestions.
 * Thin wrapper over the CRON_SECRET-gated route; see ../lib/trigger-cron.
 */
import { triggerCron } from "../lib/trigger-cron";

export const config = {
  // 03:00 UTC daily (matches the former vercel.json schedule).
  schedule: "0 3 * * *",
};

const handler = () => triggerCron("suggestions-sweep");
export default handler;
