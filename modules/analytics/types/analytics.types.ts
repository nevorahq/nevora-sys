import type { PeriodType, WidgetType, WidgetDataSource, ReportType } from "../constants/analytics.constants";

export interface AnalyticsSnapshot {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  snapshot_date: string;
  period_type: PeriodType;

  tasks_total: number;
  tasks_active: number;
  tasks_completed: number;
  tasks_overdue: number;

  crm_clients_total: number;
  crm_clients_new: number;
  crm_deals_open: number;
  crm_deals_won: number;
  crm_deals_lost: number;
  crm_revenue_won: number;

  docs_total: number;
  docs_published: number;
  docs_drafts: number;

  events_total: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AnalyticsWidget {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  widget_type: WidgetType;
  data_source: WidgetDataSource;
  config: Record<string, unknown>;
  position: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsReport {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  description: string | null;
  report_type: ReportType;
  parameters: Record<string, unknown>;
  cached_result: Record<string, unknown> | null;
  cached_at: string | null;
  is_scheduled: boolean;
  schedule_cron: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// Агрегированные метрики для дашборда (вычисляются live)
export interface DashboardMetrics {
  tasks: {
    total: number;
    active: number;
    completed: number;
    overdue: number;
    dueToday: number;
    completionRate: number; // %
  };
  crm: {
    clientsTotal: number;
    clientsNew: number;  // за последние 30 дней
    dealsOpen: number;
    dealsWon: number;
    dealsLost: number;
    revenueWon: number;
    winRate: number;     // %
  };
  documents: {
    total: number;
    published: number;
    drafts: number;
    archived: number;
  };
  activity: {
    eventsToday: number;
    eventsThisWeek: number;
    eventsThisMonth: number;
  };
}

// Точка на timeline (группировка событий по дню)
export interface ActivityTimelinePoint {
  date: string;       // ISO date "YYYY-MM-DD"
  count: number;
  byModule: {
    tasks: number;
    crm: number;
    documents: number;
    other: number;
  };
}

// Метрики конкретного модуля за период
export interface ModuleStats {
  module: "tasks" | "crm" | "documents";
  periodDays: number;
  current: number;
  previous: number;
  change: number;      // абсолютное
  changePct: number;   // %
  breakdown: Array<{ label: string; value: number }>;
}
