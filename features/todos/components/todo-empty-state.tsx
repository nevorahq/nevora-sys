/**
 * Empty State — показывается когда нет задач или фильтр ничего не нашёл.
 *
 * Не нужен "use client" — это просто отображение без интерактивности.
 * Можно использовать как Server Component.
 */
interface TodoEmptyStateProps {
  title: string;
  description: string;
}

export function TodoEmptyState({ title, description }: TodoEmptyStateProps) {
  return (
    <div className="soft-inset flex flex-col items-center justify-center py-16 px-4">
      {/* Иконка-заглушка */}
      <div className="soft-icon-button h-14 w-14 mb-4 pointer-events-none">
        <svg className="h-6 w-6 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-text-secondary">{title}</h3>
      <p className="mt-1 text-xs text-text-muted">{description}</p>
    </div>
  );
}
