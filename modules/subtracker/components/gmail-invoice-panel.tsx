"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DownloadIcon, MailIcon, SearchIcon, UnplugIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";

interface GmailStatus {
  configured: boolean;
  connected: boolean;
  email?: string | null;
}

interface InvoiceCandidate {
  messageId: string;
  partId: string;
  filename: string;
  size: number;
  subject: string;
  sender: string;
  receivedAt: string;
  importable: boolean;
}

function readableSize(bytes: number): string {
  if (!bytes) return "Unknown size";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function GmailInvoicePanel({ subscriptionId, canWrite }: { subscriptionId: string; canWrite: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [candidates, setCandidates] = useState<InvoiceCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [importingKey, setImportingKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/integrations/gmail/status", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as GmailStatus & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Gmail status could not be loaded.");
        if (active) setStatus(payload);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Gmail status could not be loaded.");
      });
    return () => { active = false; };
  }, []);

  async function search() {
    setError(null);
    setNotice(null);
    setSearching(true);
    try {
      const response = await fetch(`/api/subscriptions/${subscriptionId}/gmail-invoices`, { cache: "no-store" });
      const payload = await response.json() as { candidates?: InvoiceCandidate[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Gmail search failed.");
      setCandidates(payload.candidates ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gmail search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function importInvoice(candidate: InvoiceCandidate) {
    const key = `${candidate.messageId}:${candidate.partId}`;
    setError(null);
    setNotice(null);
    setImportingKey(key);
    try {
      const response = await fetch(`/api/subscriptions/${subscriptionId}/gmail-invoices`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId: candidate.messageId, partId: candidate.partId }),
      });
      const payload = await response.json() as { error?: string; warning?: string; alreadyImported?: boolean };
      if (!response.ok) throw new Error(payload.error ?? "The invoice could not be imported.");
      setNotice(payload.alreadyImported ? "This invoice was already linked to the subscription." : "Invoice imported and linked to the subscription.");
      if (payload.warning) setNotice(payload.warning);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The invoice could not be imported.");
    } finally {
      setImportingKey(null);
    }
  }

  async function disconnect() {
    setError(null);
    setNotice(null);
    setDisconnecting(true);
    try {
      const response = await fetch("/api/integrations/gmail/status", { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Gmail could not be disconnected.");
      setStatus({ configured: true, connected: false });
      setCandidates(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gmail could not be disconnected.");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <section className="soft-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
            <MailIcon size={17} /> Gmail invoices
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Find PDF invoices matching this subscription, then choose what to import.
          </p>
        </div>
        {status?.connected && (
          <Button type="button" variant="ghost" disabled={disconnecting || !canWrite} onClick={disconnect} className="px-3 py-2 text-xs">
            <UnplugIcon size={14} /> Disconnect
          </Button>
        )}
      </div>

      {!status && !error && <p className="mt-4 text-sm text-text-muted">Checking Gmail connection…</p>}

      {status && !status.configured && (
        <p className="mt-4 rounded-(--neu-radius-md) bg-surface-sunken px-4 py-3 text-sm text-text-muted">
          Gmail import is not configured on this server. Add the Google OAuth environment variables first.
        </p>
      )}

      {status?.configured && !status.connected && (
        <div className="mt-4">
          {canWrite ? (
            <a
              href={`/api/integrations/gmail/connect?subscriptionId=${encodeURIComponent(subscriptionId)}`}
              className="inline-flex items-center justify-center gap-2 rounded-(--neu-radius-pill) bg-text-primary px-5 py-2.5 text-sm font-semibold leading-none tracking-wide text-text-inverse shadow-neu-control transition-all hover:shadow-neu-card"
            >
              <MailIcon size={15} /> Connect Gmail
            </a>
          ) : (
            <p className="text-sm text-text-muted">You need write permission to connect Gmail.</p>
          )}
        </div>
      )}

      {status?.connected && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-(--neu-radius-md) border border-border-subtle p-4">
            <div>
              <p className="text-sm font-medium text-text-primary">{status.email}</p>
              <p className="mt-0.5 text-xs text-text-muted">Read-only access · search runs only when requested</p>
            </div>
            <Button type="button" variant="secondary" isLoading={searching} onClick={search}>
              <SearchIcon size={15} /> Find invoices
            </Button>
          </div>

          {candidates && candidates.length === 0 && (
            <p className="mt-4 text-sm text-text-muted">No matching PDF invoices found in the last 24 months.</p>
          )}

          {candidates && candidates.length > 0 && (
            <ul className="mt-4 space-y-3">
              {candidates.map((candidate) => {
                const key = `${candidate.messageId}:${candidate.partId}`;
                return (
                  <li key={key} className="rounded-(--neu-radius-md) border border-border-subtle p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">{candidate.filename}</p>
                        <p className="mt-1 truncate text-xs text-text-secondary">{candidate.subject}</p>
                        <p className="mt-1 text-xs text-text-muted">
                          {candidate.sender} · {new Date(candidate.receivedAt).toLocaleDateString()} · {readableSize(candidate.size)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        disabled={!canWrite || !candidate.importable || Boolean(importingKey)}
                        isLoading={importingKey === key}
                        onClick={() => importInvoice(candidate)}
                        className="px-4 py-2 text-xs"
                      >
                        <DownloadIcon size={14} /> {candidate.importable ? "Import" : "Too large"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {notice && <p className="mt-4 text-sm text-success" role="status">{notice}</p>}
      {error && <p className="mt-4 text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}
