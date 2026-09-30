/**
 * PostHog browser config, read on the server and handed to `PostHogProvider`.
 *
 * The project key is meant to ship in the browser bundle — same class of value
 * as `NEXT_PUBLIC_SUPABASE_ANON_KEY`, not a secret. Without a key this returns
 * `null` and analytics stays fully off: no SDK init, no network, nothing to
 * consent to beyond the banner itself.
 *
 * The project lives in PostHog's EU region, so both hosts default to EU.
 * `NEXT_PUBLIC_POSTHOG_HOST` can later point at a reverse proxy on our own
 * domain (CNAME'd to PostHog's managed proxy) so ad blockers do not match
 * PostHog's ingestion domain. Once proxied, the SDK can no longer infer where
 * the PostHog app lives, hence the separate `uiHost`.
 */
export const POSTHOG_EU_INGEST_HOST = "https://eu.i.posthog.com";
export const POSTHOG_EU_UI_HOST = "https://eu.posthog.com";

export type PostHogConfig = Readonly<{ key: string; host: string; uiHost: string }>;

export function getPostHogConfig(): PostHogConfig | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return null;

  return {
    key,
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || POSTHOG_EU_INGEST_HOST,
    uiHost: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST?.trim() || POSTHOG_EU_UI_HOST,
  };
}
