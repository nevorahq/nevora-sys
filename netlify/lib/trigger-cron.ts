/**
 * Shared trigger for the Netlify Scheduled Functions that drive our crons.
 *
 * Production is hosted on Netlify, where `vercel.json` cron entries never fire.
 * Each scheduled function is a thin wrapper that calls one of the app's
 * already-secured `/api/cron/*` route handlers with the shared CRON_SECRET —
 * exactly the way Vercel Cron would. All the real work stays in the routes; the
 * functions only carry the schedule.
 *
 * Lives OUTSIDE `netlify/functions` so Netlify does not mistake it for a
 * function entry point (netlify.toml scopes functions to that directory); the
 * bundler still inlines it into each function that imports it.
 *
 * Requires, in the Netlify function environment: CRON_SECRET (the same value the
 * routes check) and the site URL (`URL`, injected by Netlify).
 *
 * @param name  the `/api/cron/<name>` segment, which equals the function's file
 *              basename for every cron we schedule.
 */
export async function triggerCron(name: string): Promise<Response> {
  const base =
    process.env.URL ?? process.env.DEPLOY_PRIME_URL ?? process.env.DEPLOY_URL;
  const secret = process.env.CRON_SECRET;

  if (!base || !secret) {
    console.error(
      `${name}: missing URL or CRON_SECRET in the function environment`,
    );
    return new Response(
      JSON.stringify({ error: "URL or CRON_SECRET not configured" }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  const target = `${base}/api/cron/${name}`;
  const res = await fetch(target, {
    headers: { authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  console.log(`${name}: upstream responded`, res.status, body);

  return new Response(body, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
