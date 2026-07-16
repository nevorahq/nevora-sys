import { LinkIcon } from "lucide-react";

/**
 * Пустое состояние блока связей. Текст объясняет ценность связывания —
 * собрать полный бизнес-контекст (документы, платежи, задачи, подписки).
 */
export function RelationEmptyState({
  compact = false,
  title = "No linked entities yet",
  body = "Connect documents, payments, tasks or subscriptions to build full business context.",
  compactText = "No linked entities yet.",
}: {
  compact?: boolean;
  title?: string;
  body?: string;
  compactText?: string;
}) {
  if (compact) {
    return (
      <p className="text-sm text-text-muted">{compactText}</p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-(--neu-radius) bg-surface-sunken px-4 py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-text-muted">
        <LinkIcon size={18} />
      </span>
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <p className="max-w-xs text-xs text-text-muted">{body}</p>
    </div>
  );
}
