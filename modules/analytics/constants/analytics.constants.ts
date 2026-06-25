export const PERIOD_TYPES = ["daily", "weekly", "monthly"] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];

export const WIDGET_TYPES = [
  "kpi_card",
  "line_chart",
  "bar_chart",
  "pie_chart",
  "activity_feed",
  "leaderboard",
  "funnel",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const WIDGET_DATA_SOURCES = [
  "tasks",
  "crm_deals",
  "crm_clients",
  "documents",
  "domain_events",
  "snapshots",
] as const;
export type WidgetDataSource = (typeof WIDGET_DATA_SOURCES)[number];

export const REPORT_TYPES = [
  "tasks_summary",
  "crm_pipeline",
  "crm_revenue",
  "document_activity",
  "team_activity",
  "custom",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  tasks_summary:     "Tasks Summary",
  crm_pipeline:      "CRM Pipeline",
  crm_revenue:       "Revenue Report",
  document_activity: "Document Activity",
  team_activity:     "Team Activity",
  custom:            "Custom Report",
};

export const ANALYTICS_DEFAULT_DAYS = 30;
export const ANALYTICS_TIMELINE_DAYS = 7;
