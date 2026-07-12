/**
 * Netlify Scheduled Function — nightly trigger for the account-deletion purge.
 *
 * Netlify (not Vercel) is the production host, so the `vercel.json` cron entries
 * never fire here. This scheduled function is the real trigger. It deliberately
 * holds NO purge logic: it just calls the app's already-secured route
 * (app/api/cron/purge-deleted-accounts/route.ts) with the shared CRON_SECRET,
 * exactly the way Vercel Cron would. All the actual work — the sole-owner guard,
 * solo-org cascade, auth.admin.deleteUser — stays in one place.
 *
 * Netlify Functions v2: the `config.schedule` export registers the cron; the
 * handler runs against the production deploy. Requires, in the Netlify function
 * environment: CRON_SECRET (same value the route checks) and the site URL
 * (`URL`, injected by Netlify).
 */
export const config = {
  // 04:00 UTC daily — an hour after the existing nightly sweeps, off-peak.
  schedule: "0 4 * * *",
};

export default async function handler(): Promise<Response> {
  const base =
    process.env.URL ?? process.env.DEPLOY_PRIME_URL ?? process.env.DEPLOY_URL;
  const secret = process.env.CRON_SECRET;

  if (!base || !secret) {
    console.error(
      "purge-deleted-accounts: missing URL or CRON_SECRET in the function environment",
    );
    return new Response(
      JSON.stringify({ error: "URL or CRON_SECRET not configured" }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  const target = `${base}/api/cron/purge-deleted-accounts`;
  const res = await fetch(target, {
    headers: { authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  console.log("purge-deleted-accounts: upstream responded", res.status, body);

  return new Response(body, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
