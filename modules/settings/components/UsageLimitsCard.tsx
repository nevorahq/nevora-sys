import type { UsageLimit } from "../types/settings.types";

export function UsageLimitsCard({ usage, t }: { usage: UsageLimit[]; t: { title: string; limitReached: string } }) {
  return (
    <section className="soft-card-sm p-5">
      <h2 className="text-sm font-semibold text-text-primary">{t.title}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {usage.map((item) => {
          const percent = item.limit === null || item.limit === 0 ? 0 : Math.min(100, Math.round((item.used / item.limit) * 100));
          const state =
            item.limit === null ? "normal" :
            percent >= 100 ? "blocked" :
            percent >= 90 ? "danger" :
            percent >= 70 ? "warning" :
            "normal";
          const barClass = {
            normal: "bg-accent-green",
            warning: "bg-yellow-500",
            danger: "bg-danger",
            blocked: "bg-danger",
          }[state];
          return (
            <div key={item.key}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-text-muted">{item.label}</span>
                <span className="font-medium text-text-primary">{item.used}{item.unit ? ` ${item.unit}` : ""} / {item.limit === null ? "∞" : `${item.limit}${item.unit ? ` ${item.unit}` : ""}`}</span>
              </div>
              {item.limit !== null && <div className="mt-2 h-1.5 rounded-full bg-surface-sunken"><div className={`h-full rounded-full ${barClass}`} style={{ width: `${percent}%` }} /></div>}
              {state === "blocked" && <p className="mt-2 text-xs font-medium text-danger">{t.limitReached}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
