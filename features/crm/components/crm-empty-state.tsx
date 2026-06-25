import { UsersIcon } from "lucide-react";

interface CRMEmptyStateProps {
  section: string;
  filtered?: boolean;
}

export function CRMEmptyState({ section, filtered = false }: CRMEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-(--neu-radius-lg) border border-border-soft bg-surface py-16 text-center shadow-neu-sm">
      <UsersIcon size={36} strokeWidth={1} className="mb-3 text-text-muted" aria-hidden />
      <p className="text-sm font-medium text-text-primary">
        {filtered ? `No ${section} match your filters` : `No ${section} yet`}
      </p>
      <p className="mt-1 text-xs text-text-muted">
        {filtered
          ? "Try adjusting your search or filters."
          : "Get started by adding your first entry."}
      </p>
    </div>
  );
}
