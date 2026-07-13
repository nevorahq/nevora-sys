import { CheckCircle2Icon } from "lucide-react";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface ActionEmptyStateProps {
  dict: Dictionary["firstRun"];
}

/**
 * The Action Center with nothing in it.
 *
 * Ownership contract (Universal Capture beta): the Action Center owns *attention*,
 * not creation. An empty feed is not an activation moment, so this is a compact,
 * neutral acknowledgement — no Upload / Capture / Create CTAs, no First Action
 * Wizard. Creation lives in the Inbox and the owning modules; when work needs
 * review it appears here on its own.
 */
export function ActionEmptyState({ dict }: ActionEmptyStateProps) {
  return (
    <div className="flex items-center gap-3 rounded-(--neu-radius) bg-surface-sunken px-4 py-8 text-center sm:justify-center">
      <CheckCircle2Icon size={18} className="shrink-0 text-accent-green" strokeWidth={1.5} />
      <div className="text-left">
        <p className="text-sm font-medium text-text-primary">{dict.empty.actionsTitle}</p>
        <p className="mt-0.5 text-xs text-text-muted">{dict.empty.actionsBody}</p>
      </div>
    </div>
  );
}
