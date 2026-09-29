"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2Icon, HashIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { disconnectSlackAction } from "../actions/slack-integration.action";

type SlackSettingsDict = Dictionary["channels"]["slack"]["settings"];
export type SlackConnectResultView = keyof SlackSettingsDict["result"];

/** Starts the OAuth install; a plain navigation, since it redirects to Slack. */
const CONNECT_HREF = "/api/channels/slack/connect";

/**
 * Settings card: connect the user's own Slack account (OAuth install of the
 * Nevora app, `commands` scope only), show how to use the "Send to Nevora"
 * shortcut, or disconnect.
 */
export function SlackIntegrationCard({
  t,
  configured,
  connected,
  teamName,
  result,
}: {
  t: SlackSettingsDict;
  configured: boolean;
  connected: boolean;
  teamName: string | null;
  /** The outcome of the OAuth round trip that just returned here, if any. */
  result: SlackConnectResultView | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function disconnect() {
    setError(null);
    start(async () => {
      const outcome = await disconnectSlackAction().catch(() => null);
      if (!outcome?.ok) {
        setError(t.errors.disconnectFailed);
        return;
      }
      // Drops a stale `?slack=connected` banner along with the refresh.
      router.replace(pathname);
      router.refresh();
    });
  }

  return (
    <section className="soft-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
          <HashIcon size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-text-primary">{t.title}</h2>
          <p className="mt-1 text-sm text-text-muted">{t.description}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {result && (
          <p role="status" className={result === "connected" ? "text-sm text-text-secondary" : "text-sm text-danger"}>
            {t.result[result]}
          </p>
        )}
        {!configured ? (
          <p className="text-sm text-text-muted">{t.notConfigured}</p>
        ) : connected ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <CheckCircle2Icon size={16} className="text-accent-green" aria-hidden />
                {teamName ? t.connectedTo.replace("{team}", teamName) : t.connectedGeneric}
              </p>
              <Button type="button" variant="secondary" onClick={disconnect} isLoading={pending}>
                {t.disconnect}
              </Button>
            </div>
            <p className="text-xs text-text-muted">{t.howTo}</p>
          </>
        ) : (
          <a
            href={CONNECT_HREF}
            className="inline-flex items-center gap-2 self-start rounded-lg bg-info px-4 py-2 text-sm font-semibold text-text-inverse hover:opacity-90"
          >
            <HashIcon size={15} aria-hidden /> {t.connect}
          </a>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
