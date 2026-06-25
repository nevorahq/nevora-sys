import { CheckCircle2Icon } from "lucide-react";

/** Пустое состояние Action Center — «всё под контролем». */
export function ActionEmptyState({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-(--neu-radius) bg-surface-sunken px-4 py-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-accent-green">
        <CheckCircle2Icon size={20} />
      </span>
      <p className="text-sm font-medium text-text-primary">{label ?? "Nothing needs your attention"}</p>
      <p className="max-w-xs text-xs text-text-muted">
        You&apos;re all caught up. New action items appear here as your business data changes.
      </p>
    </div>
  );
}
