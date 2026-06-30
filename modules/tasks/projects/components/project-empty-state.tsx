import { FolderKanbanIcon } from "lucide-react";

export function ProjectEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="soft-card flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-(--neu-radius-md) bg-surface-sunken text-text-muted shadow-neu-inset">
        <FolderKanbanIcon size={22} strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        {description && <p className="text-xs text-text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
