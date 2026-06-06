import { RepeatIcon } from "lucide-react";

interface SubEmptyStateProps {
  title: string;
  description: string;
}

export function SubEmptyState({ title, description }: SubEmptyStateProps) {
  return (
    <div className="soft-inset flex flex-col items-center justify-center py-16 px-4 rounded-(--neu-radius-xl)">
      <div className="soft-icon-button h-14 w-14 mb-4 pointer-events-none">
        <RepeatIcon size={24} className="text-text-muted" strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-semibold text-text-secondary">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-text-muted">{description}</p>
      )}
    </div>
  );
}
