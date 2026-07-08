"use client";

import { CheckCircle2Icon } from "lucide-react";
import { EmptyState } from "@/shared/ui/empty-state";
import { FirstActionCta } from "@/modules/onboarding/components/first-action-cta";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface ActionEmptyStateProps {
  dict: Dictionary["firstRun"];
  /**
   * Suppressed while the First Action Wizard is on screen — it already offers the
   * four first actions right above, and showing them twice would read as a bug.
   */
  showFirstActions: boolean;
}

/**
 * The Action Center with nothing in it (Phase B / B6).
 *
 * Until now this component existed but had no caller: an empty feed rendered
 * literally nothing, which is the worst kind of dead end — the primary operating
 * screen looked broken. It now offers the two cheapest ways to start the loop.
 *
 * Phase B edge case #6: the first actions stay reachable from here once the wizard
 * is finished or skipped.
 */
export function ActionEmptyState({ dict, showFirstActions }: ActionEmptyStateProps) {
  return (
    <EmptyState
      icon={<CheckCircle2Icon size={24} className="text-accent-green" strokeWidth={1.5} />}
      title={dict.empty.actionsTitle}
      description={dict.empty.actionsBody}
      actions={
        showFirstActions ? (
          <>
            <FirstActionCta action="upload_document" label={dict.uploadDocument} />
            <FirstActionCta action="capture_inbox_item" label={dict.captureInboxItem} variant="secondary" />
          </>
        ) : undefined
      }
    />
  );
}
