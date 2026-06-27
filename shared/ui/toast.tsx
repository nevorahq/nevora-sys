"use client";

import { useEffect } from "react";
import { CheckCircle2Icon, XIcon } from "lucide-react";

export function Toast({
  message,
  onDismiss,
  duration = 4_000,
}: {
  message: string | null;
  onDismiss: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [duration, message, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-60 flex max-w-sm items-center gap-3 rounded-(--neu-radius-md) border border-accent-green/20 bg-surface px-4 py-3 text-sm text-text-primary shadow-neu-card"
    >
      <CheckCircle2Icon size={18} className="shrink-0 text-accent-green" />
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss notification" className="text-text-muted hover:text-text-primary">
        <XIcon size={16} />
      </button>
    </div>
  );
}
