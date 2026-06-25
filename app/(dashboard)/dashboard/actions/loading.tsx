/** Loading state для Action Center. */
export default function ActionsLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded-(--neu-radius) bg-surface-sunken" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-(--neu-radius) bg-surface-sunken" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-(--neu-radius) bg-surface-sunken" />
        ))}
      </div>
    </div>
  );
}
