/** Loading skeleton for the Money list (Phase 7.9). */
export default function MoneyLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-36 animate-pulse rounded-(--neu-radius) bg-surface-sunken" />
        <div className="h-9 w-32 animate-pulse rounded-(--neu-radius-pill) bg-surface-sunken" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-(--neu-radius) bg-surface-sunken" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-(--neu-radius) bg-surface-sunken" />
        ))}
      </div>
    </div>
  );
}
