/**
 * Netlify Scheduled Function — durability sweep for stuck document extractions.
 * Thin wrapper over the CRON_SECRET-gated route; see ../lib/trigger-cron.
 */
import { triggerCron } from "../lib/trigger-cron";

export const config = {
  // Every 10 minutes (matches the former vercel.json schedule).
  schedule: "*/10 * * * *",
};

const handler = () => triggerCron("extraction-sweep");
export default handler;
