import type { UsageLimit } from "../types/settings.types";

export function UsageLimitsCard({ usage }: { usage: UsageLimit[] }) {
  return (
    <section className="soft-card-sm p-5">
      <h2 className="text-sm font-semibold text-text-primary">Usage and limits</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {usage.map((item) => {
          const percent = item.limit === null || item.limit === 0 ? 0 : Math.min(100, Math.round((item.used / item.limit) * 100));
          return (
            <div key={item.key}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-text-muted">{item.label}</span>
                <span className="font-medium text-text-primary">{item.used}{item.unit ? ` ${item.unit}` : ""} / {item.limit === null ? "∞" : `${item.limit}${item.unit ? ` ${item.unit}` : ""}`}</span>
              </div>
              {item.limit !== null && <div className="mt-2 h-1.5 rounded-full bg-surface-sunken"><div className="h-full rounded-full bg-accent-green" style={{ width: `${percent}%` }} /></div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
