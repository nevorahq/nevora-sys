"use client";

import { useState, useTransition } from "react";
import { CheckCircle2Icon, CopyIcon, ExternalLinkIcon, Globe2Icon, LockKeyholeIcon } from "lucide-react";
import { togglePublicBookingPageAction } from "../actions/toggle-public-booking-page.action";

export function PublicPageStatus({
  url,
  publicEnabled,
  canManage,
}: {
  url: string;
  publicEnabled: boolean;
  canManage: boolean;
}) {
  const [isPublic, setIsPublic] = useState(publicEnabled);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleVisibility() {
    setError(null);
    const next = !isPublic;
    startTransition(async () => {
      const result = await togglePublicBookingPageAction(next);
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsPublic(next);
    });
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="rounded-(--neu-radius-lg) border border-border-soft bg-surface p-5 shadow-neu-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isPublic ? <Globe2Icon size={18} className="text-accent-green" /> : <LockKeyholeIcon size={18} className="text-text-muted" />}
            <h2 className="text-base font-semibold text-text-primary">Public booking page</h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isPublic ? "bg-accent-green-soft text-text-primary" : "bg-surface-sunken text-text-muted"}`}>
              {isPublic ? "Published" : "Unpublished"}
            </span>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            {isPublic ? "Clients can use this link to choose a specialist and request a booking." : "Publish the page before sharing it. Unpublished pages return 404 to visitors."}
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={toggleVisibility}
            disabled={isPending}
            className="shrink-0 rounded-(--neu-radius-pill) bg-text-primary px-4 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Saving…" : isPublic ? "Unpublish" : "Publish page"}
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-(--neu-radius-md) bg-surface-sunken px-3 py-2">
        <code className="min-w-0 flex-1 truncate text-xs text-text-secondary">{url}</code>
        <button type="button" onClick={copyUrl} className="rounded p-1 text-text-muted hover:text-text-primary" aria-label="Copy public booking URL">
          {copied ? <CheckCircle2Icon size={16} className="text-accent-green" /> : <CopyIcon size={16} />}
        </button>
        {isPublic && (
          <a href={url} target="_blank" rel="noreferrer" className="rounded p-1 text-text-muted hover:text-text-primary" aria-label="Open public booking page">
            <ExternalLinkIcon size={16} />
          </a>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
