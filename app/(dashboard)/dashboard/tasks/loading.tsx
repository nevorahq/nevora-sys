/** Loading skeleton for the Tasks list (Phase 7.9). */
export default function TasksLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 animate-pulse rounded-(--neu-radius) bg-surface-sunken" />
        <div className="h-9 w-28 animate-pulse rounded-(--neu-radius-pill) bg-surface-sunken" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-(--neu-radius) bg-surface-sunken" />
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
