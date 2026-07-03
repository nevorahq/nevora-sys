/** Loading skeleton for the Subscriptions list (Phase 7.9). */
export default function SubscriptionsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-44 animate-pulse rounded-(--neu-radius) bg-surface-sunken" />
        <div className="h-9 w-36 animate-pulse rounded-(--neu-radius-pill) bg-surface-sunken" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-(--neu-radius) bg-surface-sunken" />
        ))}
      </div>
    </div>
  );
}
