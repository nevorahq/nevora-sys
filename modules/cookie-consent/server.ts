import "server-only";

import { after } from "next/server";
import { cookies } from "next/headers";

import { CONSENT_COOKIE, parseConsent } from "./cookie-consent";
import { getPostHogConfig, POSTHOG_EU_INGEST_HOST } from "./posthog-config";

/**
 * Product events PostHog funnels are built on. One closed list so a typo can't
 * open a new event name, and so the whole analytics surface is reviewable here.
 */
export type ServerEventName =
  | "user_signed_up"
  | "organization_created"
  | "inbox_entry_captured"
  | "task_created"
  | "document_uploaded"
  | "telegram_link_started";

/** Ids, counts and enum values only — never titles, names, emails or amounts. */
export type ServerEventProperties = Record<string, string | number | boolean | null>;

/**
 * Records a product event for a signed-in user — only when this browser has
 * accepted analytics cookies, the same consent that gates `posthog-js`.
 *
 * Server-side on purpose: these events mark a committed write (the row exists),
 * which a client-side capture cannot promise, and ad blockers don't drop them.
 * The user's internal id is the distinct id, matching `PostHogIdentify` in the
 * browser, so both sides land on one person.
 *
 * It goes straight to PostHog's EU ingestion host rather than the browser's
 * `NEXT_PUBLIC_POSTHOG_HOST` reverse proxy: the proxy only exists to dodge ad
 * blockers, and the server shouldn't depend on its DNS.
 *
 * Sent after the response (`after()`), and every failure is swallowed:
 * analytics must never slow down or break the action that called it.
 */
export async function trackServerEvent(
  userId: string,
  event: ServerEventName,
  properties: ServerEventProperties = {},
): Promise<void> {
  const config = getPostHogConfig();
  if (!config) return;

  try {
    const consent = parseConsent((await cookies()).get(CONSENT_COOKIE)?.value ?? null);
    if (!consent?.analytics) return;
  } catch {
    // Outside a request (script, cron) there is no visitor consent to read.
    return;
  }

  const body = JSON.stringify({
    api_key: config.key,
    event,
    distinct_id: userId,
    timestamp: new Date().toISOString(),
    properties: { ...properties, $lib: "nevora-server" },
  });

  const send = async () => {
    try {
      await fetch(`${POSTHOG_EU_INGEST_HOST}/i/v0/e/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      // Dropped event; nothing to retry against.
    }
  };

  try {
    after(send);
  } catch {
    void send();
  }
}
