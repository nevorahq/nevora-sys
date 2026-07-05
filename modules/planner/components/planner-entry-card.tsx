import { Card } from "@/shared/ui/card";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { PlannerEntryWithSuggestions } from "../types/planner.types";
import { PlannerEntryEditor } from "./planner-entry-editor";
import { PlannerSuggestionCard } from "./planner-suggestion-card";

interface PlannerEntryCardProps {
  entry: PlannerEntryWithSuggestions;
  dict: Dictionary["inbox"];
  canUpdate: boolean;
  canDelete: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  captured: "bg-surface-sunken text-text-secondary",
  processing: "bg-accent-yellow/20 text-text-primary",
  suggested: "bg-info-soft text-info",
  accepted: "bg-success-soft text-success",
  rejected: "bg-surface-sunken text-text-tertiary",
  failed: "bg-danger-soft text-danger",
  archived: "bg-surface-sunken text-text-tertiary",
};

/**
 * A single capture with its derived suggestions. Pure presentation — all writes
 * happen through the suggestion cards' Server Actions.
 */
export function PlannerEntryCard({ entry, dict, canUpdate, canDelete }: PlannerEntryCardProps) {
  const statusLabel = dict.statuses[entry.status] ?? entry.status;

  return (
    <Card size="sm" className="flex flex-col gap-3">
      <PlannerEntryEditor
        entryId={entry.id}
        rawText={entry.raw_text}
        dict={dict}
        canUpdate={canUpdate}
        canDelete={canDelete}
      >
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[entry.status] ?? STATUS_STYLES.captured}`}
        >
          {statusLabel}
        </span>
      </PlannerEntryEditor>

      {entry.status === "failed" && (
        <p className="text-xs text-danger">{dict.failed}</p>
      )}

      {entry.suggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          {entry.suggestions.map((s) => (
            <PlannerSuggestionCard key={s.id} suggestion={s} dict={dict} />
          ))}
        </div>
      )}
    </Card>
  );
}
