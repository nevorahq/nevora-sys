/**
 * Netlify Scheduled Function — reminder delivery sweep.
 * Thin wrapper over the CRON_SECRET-gated route; see ../lib/trigger-cron.
 */
import { triggerCron } from "../lib/trigger-cron";

export const config = {
  // Every 5 minutes (matches the former vercel.json schedule).
  schedule: "*/5 * * * *",
};

const handler = () => triggerCron("reminders");
export default handler;
