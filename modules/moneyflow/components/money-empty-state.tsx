import { ReceiptIcon } from "lucide-react";

/**
 * MoneyEmptyState — показывается когда нет транзакций.
 *
 * Server Component — чистый display, нет интерактивности.
 *
 * UX best practice: empty state не должен быть "пустотой".
 * Он должен:
 * 1. Объяснить что здесь будет ("Транзакций пока нет")
 * 2. Подсказать действие ("Создайте первую транзакцию...")
 * 3. Визуально не выглядеть как ошибка (иконка, мягкие цвета)
 */
interface MoneyEmptyStateProps {
  title: string;
  description: string;
}

export function MoneyEmptyState({ title, description }: MoneyEmptyStateProps) {
  return (
    <div className="soft-inset flex flex-col items-center justify-center py-16 px-4 rounded-(--neu-radius-xl)">
      <div className="soft-icon-button h-14 w-14 mb-4 pointer-events-none">
        <ReceiptIcon size={24} className="text-text-muted" strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-semibold text-text-secondary">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-text-muted">{description}</p>
      )}
    </div>
  );
}
