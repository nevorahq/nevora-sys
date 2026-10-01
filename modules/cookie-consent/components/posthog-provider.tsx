"use client";

import { useEffect } from "react";
import type { PostHog } from "posthog-js";

import { loadConsent, subscribeToConsent, type ConsentState } from "../cookie-consent";
import type { PostHogConfig } from "../posthog-config";

let loading: Promise<PostHog> | null = null;
/** The signed-in user's internal id, set by `PostHogIdentify`; never an email or name. */
let identity: string | null = null;

/**
 * Loads and initializes the SDK once. The import is dynamic, like Sentry's in
 * `instrumentation-client.ts`: a visitor who never accepts analytics never
 * downloads posthog-js, and PostHog never sees a request from them.
 */
function loadPostHog(config: PostHogConfig): Promise<PostHog> {
  loading ??= import("posthog-js").then(({ default: posthog }) => {
    posthog.init(config.key, {
      api_host: config.host,
      ui_host: config.uiHost,
      defaults: "2026-08-30",
      capture_performance: { web_vitals: true },
      // Belt and braces: even once loaded, nothing is captured or stored until
      // `opt_in_capturing` below runs for a recorded acceptance.
      opt_out_capturing_by_default: true,
      opt_out_persistence_by_default: true,
      persistence: "localStorage+cookie",
      disable_session_recording: true,
      mask_all_text: true,
    });
    return posthog;
  });
  return loading;
}

/** Ties the anonymous visitor to the account id — only for an opted-in SDK. */
function syncIdentity(posthog: PostHog) {
  if (!identity || posthog.has_opted_out_capturing()) return;
  if (posthog.get_distinct_id() !== identity) posthog.identify(identity);
}

/**
 * Called on sign-out: the next person on this browser must not inherit the
 * previous account's distinct id. A no-op when the SDK never loaded.
 */
export function resetPostHogIdentity() {
  identity = null;
  void loading?.then((posthog) => posthog.reset());
}

/**
 * Rendered by the signed-in app shell. Hands the user's internal id to the SDK
 * so landing pageviews, app events and server-side events (`trackServerEvent`
 * uses the same id) join one person. Does nothing until analytics is accepted.
 */
export function PostHogIdentify({ userId }: { userId: string }) {
  useEffect(() => {
    identity = userId;
    void loading?.then(syncIdentity);
  }, [userId]);

  return null;
}

/**
 * Opt-in analytics. `config` is `null` whenever `NEXT_PUBLIC_POSTHOG_KEY` is
 * unset — this then renders nothing and never loads the SDK.
 *
 * Nothing touches PostHog before the cookie-consent banner records
 * `analytics: true`: no script, no network, no cookies. Acceptance (now or on a
 * later visit) loads the SDK and opts in without a reload; a later decline
 * opts the already-loaded SDK back out.
 *
 * The dashboard shows workspace data (clients, amounts, documents), so session
 * replay stays off and autocapture drops element text: events keep the page and
 * the element, never what was written on it. Signed-in users are identified by
 * their internal id only (`PostHogIdentify`) — no email, name or other person
 * properties are sent.
 */
export function PostHogProvider({ config }: { config: PostHogConfig | null }) {
  useEffect(() => {
    if (!config) return;

    const apply = (state: ConsentState | null) => {
      if (state?.analytics) {
        void loadPostHog(config).then((posthog) => {
          posthog.opt_in_capturing();
          syncIdentity(posthog);
        });
      } else if (loading) {
        void loading.then((posthog) => posthog.opt_out_capturing());
      }
    };

    apply(loadConsent());
    return subscribeToConsent(apply);
  }, [config]);

  return null;
}
