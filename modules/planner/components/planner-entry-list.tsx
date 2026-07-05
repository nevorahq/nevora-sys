import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { PlannerEntryWithSuggestions } from "../types/planner.types";
import { PlannerEntryCard } from "./planner-entry-card";

interface PlannerEntryListProps {
  entries: PlannerEntryWithSuggestions[];
  dict: Dictionary["inbox"];
  canUpdate: boolean;
  canDelete: boolean;
}

export function PlannerEntryList({ entries, dict, canUpdate, canDelete }: PlannerEntryListProps) {
  if (entries.length === 0) {
    return (
      <div className="soft-card p-8 text-center text-sm text-text-tertiary">
        {dict.empty}
      </div>
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
