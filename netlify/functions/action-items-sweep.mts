/**
 * Netlify Scheduled Function — durable Action Center generation sweep.
 * Thin wrapper over the CRON_SECRET-gated route; see ../lib/trigger-cron.
 */
import { triggerCron } from "../lib/trigger-cron";

export const config = {
  // Hourly at :20 — attention should surface within the hour, independent of
  // whether anyone opened the feed.
  schedule: "20 * * * *",
};

const handler = () => triggerCron("action-items-sweep");
export default handler;
