/**
 * Netlify Scheduled Function — daily notification digest (ADR 003).
 * Runs every hour so each user's digest goes out at their own local hour;
 * thin wrapper over the CRON_SECRET-gated route, see ../lib/trigger-cron.
 */
import { triggerCron } from "../lib/trigger-cron";

export const config = {
  // Minute 5 of every hour — after the */5 reminders run has materialized the morning's items.
  schedule: "5 * * * *",
};

const handler = () => triggerCron("notification-digest");
export default handler;
