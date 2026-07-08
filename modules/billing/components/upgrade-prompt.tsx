"use client";

import { AlertCircleIcon, ArrowUpCircleIcon, XIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { UpgradePromptModel } from "../services/upgrade-prompt.service";

export function UpgradePrompt({
  prompt,
  onUpgrade,
  onViewPricing,
  onDismiss,
  isLoading,
}: {
  prompt: UpgradePromptModel;
  onUpgrade: () => void;
  onViewPricing: () => void;
  onDismiss: () => void;
  isLoading?: boolean;
}) {
  return (
    <section className="soft-card-sm border border-border-soft p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <AlertCircleIcon
            size={18}
            className={prompt.severity === "blocked" ? "mt-0.5 shrink-0 text-danger" : "mt-0.5 shrink-0 text-yellow-600"}
            aria-hidden
          />
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{prompt.title}</h3>
            <p className="mt-1 text-sm text-text-secondary">{prompt.message}</p>
            <p className="mt-2 text-xs font-medium text-text-muted">Usage: {prompt.usageText}</p>
            <p className="mt-1 text-xs text-text-muted">{prompt.valueText}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full p-1 text-text-muted hover:bg-surface-muted hover:text-text-primary"
          aria-label="Dismiss upgrade prompt"
        >
          <XIcon size={16} />
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={onUpgrade} isLoading={isLoading}>
          <ArrowUpCircleIcon size={15} />
          Upgrade
        </Button>
        <Button type="button" variant="secondary" onClick={onViewPricing}>
          View pricing
        </Button>
        <Button type="button" variant="ghost" onClick={onDismiss}>
          Maybe later
        </Button>
      </div>
    </section>
  );
}
