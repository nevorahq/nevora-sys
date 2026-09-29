"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, ExternalLinkIcon, MailIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { disconnectEmailForwardingAction, issueEmailForwardingAddressAction } from "../actions/email-integration.action";

type EmailSettingsDict = Dictionary["channels"]["email"]["settings"];

export interface ForwardingConfirmationView {
  code: string | null;
  link: string | null;
}

/**
 * Settings card: the user's personal forwarding address, the one sender it
 * accepts, the Gmail setup hint, and the Gmail confirmation code once Gmail
 * mails it to the address.
 */
export function EmailIntegrationCard({
  t,
  configured,
  address,
  accountEmail,
  confirmation,
}: {
  t: EmailSettingsDict;
  configured: boolean;
  address: string | null;
  accountEmail: string | null;
  confirmation: ForwardingConfirmationView | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function issue() {
    setError(null);
    start(async () => {
      const result = await issueEmailForwardingAddressAction().catch(() => null);
      if (!result?.ok) {
        setError(result?.code === "not_configured" ? t.notConfigured : t.errors.failed);
        return;
      }
      router.refresh();
    });
  }

  function disconnect() {
    setError(null);
    start(async () => {
      const result = await disconnectEmailForwardingAction().catch(() => null);
      if (!result?.ok) {
        setError(t.errors.disconnectFailed);
        return;
      }
      router.refresh();
    });
  }

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the address is selectable text.
    }
  }

  return (
    <section className="soft-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
          <MailIcon size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-text-primary">{t.title}</h2>
          <p className="mt-1 text-sm text-text-muted">{t.description}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {!configured ? (
          <p className="text-sm text-text-muted">{t.notConfigured}</p>
        ) : !address ? (
          <Button type="button" onClick={issue} isLoading={pending} className="self-start">
            <MailIcon size={16} aria-hidden /> {t.getAddress}
          </Button>
        ) : (
          <>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{t.addressLabel}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="min-w-0 select-all break-all rounded-(--neu-radius-sm) bg-surface-sunken px-3 py-2 font-mono text-sm text-text-primary">
                  {address}
                </code>
                <Button type="button" variant="secondary" onClick={copy} aria-label={t.copy}>
                  {copied ? <CheckIcon size={16} aria-hidden /> : <CopyIcon size={16} aria-hidden />}
                  <span className="hidden sm:inline">{copied ? t.copied : t.copy}</span>
                </Button>
              </div>
            </div>
            {accountEmail && <p className="text-sm text-text-secondary">{t.senderRule.replace("{email}", accountEmail)}</p>}
            <p className="text-xs text-text-muted">{t.gmailHint}</p>

            {confirmation && (confirmation.code || confirmation.link) && (
              <div className="rounded-(--neu-radius-md) border border-info/20 bg-info-soft p-3 text-sm text-text-primary">
                <p className="font-semibold">{t.confirmationTitle}</p>
                {confirmation.code && (
                  <>
                    <p className="mt-1 text-text-secondary">{t.confirmationBody}</p>
                    <p className="mt-2 select-all font-mono text-lg tracking-[0.15em]">{confirmation.code}</p>
                  </>
                )}
                {confirmation.link && (
                  <a href={confirmation.link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 font-medium text-info underline">
                    <ExternalLinkIcon size={14} aria-hidden /> {t.confirmationLink}
                  </a>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={issue} isLoading={pending}>
                <RefreshCwIcon size={15} aria-hidden /> {t.rotate}
              </Button>
              <Button type="button" variant="ghost" onClick={disconnect} disabled={pending}>
                {t.disconnect}
              </Button>
            </div>
            <p className="text-xs text-text-muted">{t.rotateHint}</p>
          </>
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
