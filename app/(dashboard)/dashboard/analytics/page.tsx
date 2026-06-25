import {
  TrendingUpIcon,
  UsersIcon,
  CheckSquareIcon,
  FileTextIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  MinusIcon,
} from "lucide-react";
import { requireOrg } from "@/lib/auth/require-org";
import {
  getDashboardMetrics,
  getActivityTimeline,
  getModuleStats,
} from "@/modules/analytics";
import type {
  DashboardMetrics,
  ActivityTimelinePoint,
  ModuleStats,
} from "@/modules/analytics";

export default async function AnalyticsPage() {
  const { org } = await requireOrg();

  const [metrics, timeline, moduleStats] = await Promise.all([
    getDashboardMetrics(org.id, 30),
    getActivityTimeline(org.id, 7),
    getModuleStats(org.id, 30),
  ]);

  return (
    <>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Analytics</h1>
        <p className="mt-1 text-sm text-text-muted">
          Business metrics for the last 30 days
        </p>
      </div>

      {/* KPI cards */}
      <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          icon={<CheckSquareIcon size={16} />}
          label="Active Tasks"
          value={metrics.tasks.active}
          sub={`${metrics.tasks.completionRate}% completion rate`}
          accent="blue"
        />
        <KpiCard
          icon={<TrendingUpIcon size={16} />}
          label="Open Deals"
          value={metrics.crm.dealsOpen}
          sub={`${metrics.crm.winRate}% win rate`}
          accent="green"
        />
        <KpiCard
          icon={<UsersIcon size={16} />}
          label="Total Clients"
          value={metrics.crm.clientsTotal}
          sub={`+${metrics.crm.clientsNew} new this period`}
          accent="purple"
        />
        <KpiCard
          icon={<FileTextIcon size={16} />}
          label="Documents"
          value={metrics.documents.total}
          sub={`${metrics.documents.published} published`}
          accent="yellow"
        />
      </section>

      {/* Revenue + Activity row */}
      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <RevenueCard metrics={metrics} />
        <ActivityCard timeline={timeline} />
      </section>

      {/* Module stats */}
      <section className="mt-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-secondary">
          Module breakdown · last 30 days
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ModuleCard stats={moduleStats.tasks} />
          <ModuleCard stats={moduleStats.crm} />
          <ModuleCard stats={moduleStats.documents} />
        </div>
      </section>

      {/* Event activity summary */}
      <section className="mt-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-secondary">
          Activity
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <StatTile label="Events today"      value={metrics.activity.eventsToday} />
          <StatTile label="Events this week"  value={metrics.activity.eventsThisWeek} />
          <StatTile label="Events this month" value={metrics.activity.eventsThisMonth} />
        </div>
      </section>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT_STYLES: Record<string, string> = {
  blue:   "text-blue-500",
  green:  "text-accent-green",
  purple: "text-purple-500",
  yellow: "text-accent-yellow",
};

function KpiCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  accent: string;
}) {
  const color = ACCENT_STYLES[accent] ?? ACCENT_STYLES.blue;
  return (
    <div className="soft-card-sm p-4">
      <div className={`flex items-center gap-2 ${color}`}>
        {icon}
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-text-primary">{value}</p>
      <p className="mt-1 text-xs text-text-muted">{sub}</p>
    </div>
  );
}

function RevenueCard({ metrics }: { metrics: DashboardMetrics }) {
  const fmt = new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  });
  return (
    <div className="soft-card-sm p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        Revenue Won
      </p>
      <p className="mt-2 text-3xl font-semibold text-text-primary">
        {fmt.format(metrics.crm.revenueWon)}
      </p>
      <div className="mt-4 flex gap-6 text-xs text-text-muted">
        <span>Won: <strong className="text-accent-green">{metrics.crm.dealsWon}</strong></span>
        <span>Lost: <strong className="text-red-400">{metrics.crm.dealsLost}</strong></span>
        <span>Open: <strong className="text-text-primary">{metrics.crm.dealsOpen}</strong></span>
      </div>
    </div>
  );
}

function ActivityCard({ timeline }: { timeline: ActivityTimelinePoint[] }) {
  const max = Math.max(...timeline.map((p) => p.count), 1);
  return (
    <div className="soft-card-sm p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        Events — last 7 days
      </p>
      <div className="mt-4 flex items-end gap-1 h-16">
        {timeline.map((point) => {
          const heightPct = Math.round((point.count / max) * 100);
          return (
            <div key={point.date} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-blue-400/70"
                style={{ height: `${Math.max(heightPct, 4)}%` }}
                title={`${point.date}: ${point.count} events`}
              />
              <span className="text-[9px] text-text-muted">
                {new Date(point.date).toLocaleDateString("en-US", { weekday: "narrow" })}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-4 text-[10px] text-text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />Tasks
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-accent-green" />CRM
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-accent-yellow" />Docs
        </span>
      </div>
    </div>
  );
}

function ModuleCard({ stats }: { stats: ModuleStats }) {
  const label =
    stats.module === "tasks"
      ? "Tasks"
      : stats.module === "crm"
      ? "CRM Deals"
      : "Documents";

  const positive = stats.change >= 0;
  const Icon     = stats.change === 0 ? MinusIcon : positive ? ArrowUpIcon : ArrowDownIcon;
  const clr      = stats.change === 0
    ? "text-text-muted"
    : positive ? "text-accent-green" : "text-red-400";

  return (
    <div className="soft-card-sm p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-text-primary">
        {stats.current}
        <span className="ml-1 text-sm font-normal text-text-muted">new</span>
      </p>
      <div className={`mt-1 flex items-center gap-1 text-xs ${clr}`}>
        <Icon size={12} />
        <span>
          {stats.change >= 0 ? "+" : ""}
          {stats.change} vs previous {stats.periodDays}d
          {stats.previous > 0 && ` (${stats.changePct}%)`}
        </span>
      </div>
      {stats.breakdown.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          {stats.breakdown.slice(0, 4).map((b) => (
            <div key={b.label} className="flex items-center justify-between text-xs">
              <span className="capitalize text-text-muted">{b.label}</span>
              <span className="font-medium text-text-primary">{b.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="soft-card-sm flex flex-col gap-1 p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}
