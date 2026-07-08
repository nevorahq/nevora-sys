import { InboxIcon } from "lucide-react";
import { EmptyState } from "@/shared/ui/empty-state";
import { FirstActionCta } from "@/modules/onboarding/components/first-action-cta";
import { CAPTURE_INPUT_ID } from "./capture-input";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { PlannerEntryWithSuggestions } from "../types/planner.types";
import { PlannerEntryCard } from "./planner-entry-card";

interface PlannerEntryListProps {
  entries: PlannerEntryWithSuggestions[];
  dict: Dictionary["inbox"];
  /** Phase B / B6 activation copy, which lives with the wizard's, not the module's. */
  firstRunDict: Dictionary["firstRun"];
  canUpdate: boolean;
  canDelete: boolean;
}

export function PlannerEntryList({ entries, dict, firstRunDict, canUpdate, canDelete }: PlannerEntryListProps) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<InboxIcon size={24} className="text-text-muted" strokeWidth={1.5} />}
        title={firstRunDict.empty.inboxTitle}
        description={firstRunDict.empty.inboxBody}
        actions={
          // The capture box is already on this page — focus it rather than
          // navigating to the page the user is standing on.
          <FirstActionCta
            action="capture_inbox_item"
            label={firstRunDict.captureInboxItem}
            focusTargetId={CAPTURE_INPUT_ID}
          />
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => (
        <PlannerEntryCard
          key={entry.id}
          entry={entry}
          dict={dict}
          canUpdate={canUpdate}
          canDelete={canDelete}
        />
      ))}
    </div>
  );
}
