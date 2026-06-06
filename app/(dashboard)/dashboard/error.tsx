"use client";

/**
 * Error Boundary для /dashboard.
 *
 * "use client" — ОБЯЗАТЕЛЕН. Error boundaries в App Router
 * должны быть Client Components, потому что ошибки
 * могут произойти во время гидрации на клиенте.
 *
 * Next.js автоматически оборачивает page.tsx в ErrorBoundary:
 * <ErrorBoundary fallback={<Error />}>
 *   <Page />
 * </ErrorBoundary>
 *
 * reset() — функция для повторной попытки рендеринга.
 * Полезно если ошибка временная (сеть восстановилась).
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-8">
      <div className="soft-card p-8 text-center max-w-md">
        <div className="soft-icon-button h-14 w-14 mx-auto mb-4 pointer-events-none">
          <svg className="h-6 w-6 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-text-primary">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          {error.message || "An unexpected error occurred"}
        </p>
        <button
          onClick={reset}
          className="mt-6 inline-flex items-center justify-center rounded-(--neu-radius-pill) bg-text-primary px-6 py-2.5 text-sm font-semibold text-text-inverse shadow-neu-control hover:shadow-neu-card active:shadow-neu-inset active:scale-[0.98] transition-all"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
