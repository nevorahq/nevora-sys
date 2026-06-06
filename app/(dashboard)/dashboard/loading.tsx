/**
 * Loading state для /dashboard.
 *
 * Next.js автоматически показывает этот компонент,
 * пока Server Component (page.tsx) загружается.
 *
 * Это файловая конвенция App Router:
 * loading.tsx рядом с page.tsx = Suspense boundary.
 *
 * Под капотом Next.js оборачивает page.tsx в:
 * <Suspense fallback={<Loading />}>
 *   <Page />
 * </Suspense>
 */
export default function DashboardLoading() {
  return (
    <main className="flex flex-1 flex-col p-6 md:p-8">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-40 animate-pulse rounded-(--neu-radius-md) bg-surface-sunken" />
          <div className="h-4 w-56 animate-pulse rounded-(--neu-radius-sm) bg-surface-sunken" />
        </div>
        <div className="h-10 w-20 animate-pulse rounded-(--neu-radius-pill) bg-surface-sunken" />
      </div>

      {/* Form skeleton */}
      <div className="mt-6 soft-card-sm p-4">
        <div className="h-10 w-full animate-pulse rounded-(--neu-radius-md) bg-surface-sunken" />
      </div>

      {/* List skeleton */}
      <div className="mt-4 space-y-2.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="soft-card-sm flex items-center gap-3 p-4">
            <div className="h-5 w-5 animate-pulse rounded-(--neu-radius-sm) bg-surface-sunken" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-3/4 animate-pulse rounded-(--neu-radius-sm) bg-surface-sunken" />
              <div className="h-3 w-1/2 animate-pulse rounded-(--neu-radius-sm) bg-surface-sunken" />
            </div>
            <div className="h-5 w-16 animate-pulse rounded-(--neu-radius-pill) bg-surface-sunken" />
          </div>
        ))}
      </div>
    </main>
  );
}
