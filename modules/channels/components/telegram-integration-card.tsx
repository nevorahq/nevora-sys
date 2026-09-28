"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, ExternalLinkIcon, SendIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { disconnectTelegramAction, issueTelegramLinkCodeAction } from "../actions/channel-integration.action";

type TelegramSettingsDict = Dictionary["channels"]["telegram"]["settings"];

/**
 * Settings card: connect the user's own Telegram account to the Nevora bot with
 * a one-time code (deep link or typed), or disconnect it.
 */
export function TelegramIntegrationCard({
  t,
  configured,
  botUsername,
  connectedAs,
}: {
  t: TelegramSettingsDict;
  configured: boolean;
  botUsername: string | null;
  /** Telegram @username (or id) when connected, else null. */
  connectedAs: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [issued, setIssued] = useState<{ code: string; deepLink: string | null; ttlMinutes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function issue() {
    setError(null);
    start(async () => {
      const result = await issueTelegramLinkCodeAction().catch(() => null);
      if (!result || !result.ok) {
        setError(result?.code === "not_configured" ? t.notConfigured : t.errors.failed);
        return;
      }
      setIssued({ code: result.code, deepLink: result.deepLink, ttlMinutes: result.ttlMinutes });
    });
  }

  function disconnect() {
    setError(null);
    start(async () => {
      const result = await disconnectTelegramAction().catch(() => null);
      if (!result?.ok) {
        setError(t.errors.disconnectFailed);
        return;
      }
      setIssued(null);
      router.refresh();
    });
  }

  return (
    <section className="soft-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
          <SendIcon size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-text-primary">{t.title}</h2>
          <p className="mt-1 text-sm text-text-muted">{t.description}</p>
        </div>
      </div>

      <div className="mt-5">
        {!configured ? (
          <p className="text-sm text-text-muted">{t.notConfigured}</p>
        ) : connectedAs ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <CheckCircle2Icon size={16} className="text-accent-green" aria-hidden />
              {t.connectedAs.replace("{name}", connectedAs)}
            </p>
            <Button type="button" variant="secondary" onClick={disconnect} isLoading={pending}>
              {t.disconnect}
            </Button>
          </div>
        ) : issued ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-secondary">{t.codeIntro}</p>
            <p className="select-all self-start rounded-(--neu-radius-sm) bg-surface-sunken px-4 py-2 font-mono text-xl tracking-[0.2em] text-text-primary">
              {issued.code}
            </p>
            <p className="text-xs text-text-muted">{t.codeExpires.replace("{minutes}", String(issued.ttlMinutes))}</p>
            <div className="flex flex-wrap gap-2">
              {issued.deepLink && botUsername && (
                <a
                  href={issued.deepLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-info px-4 py-2 text-sm font-semibold text-text-inverse hover:opacity-90"
                >
                  <ExternalLinkIcon size={15} aria-hidden /> {t.openBot.replace("{bot}", botUsername)}
                </a>
              )}
              <Button type="button" variant="secondary" onClick={issue} isLoading={pending}>
                {t.newCode}
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" onClick={issue} isLoading={pending}>
            <SendIcon size={16} aria-hidden /> {t.connect}
          </Button>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
