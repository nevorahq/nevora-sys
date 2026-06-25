// Types
export type {
  AnalyticsSnapshot,
  AnalyticsWidget,
  AnalyticsReport,
  DashboardMetrics,
  ActivityTimelinePoint,
  ModuleStats,
} from "./types/analytics.types";

// Constants
export {
  PERIOD_TYPES,
  WIDGET_TYPES,
  WIDGET_DATA_SOURCES,
  REPORT_TYPES,
  REPORT_TYPE_LABELS,
  ANALYTICS_DEFAULT_DAYS,
  ANALYTICS_TIMELINE_DAYS,
} from "./constants/analytics.constants";
export type {
  PeriodType,
  WidgetType,
  WidgetDataSource,
  ReportType,
} from "./constants/analytics.constants";

// Schemas
export {
  createSnapshotSchema,
  createWidgetSchema,
  updateWidgetSchema,
  createReportSchema,
  getMetricsSchema,
} from "./schemas/analytics.schemas";
export type {
  CreateSnapshotInput,
  CreateWidgetInput,
  UpdateWidgetInput,
  CreateReportInput,
  GetMetricsInput,
} from "./schemas/analytics.schemas";

// Queries
export { getDashboardMetrics }   from "./queries/get-dashboard-metrics";
export { getActivityTimeline }   from "./queries/get-activity-timeline";
export { getModuleStats }        from "./queries/get-module-stats";
export { getSnapshots }          from "./queries/get-snapshots";
export type { GetSnapshotsOptions } from "./queries/get-snapshots";
export { getWidgets }            from "./queries/get-widgets";

// Actions
export { createSnapshotAction }  from "./actions/create-snapshot.action";
export { createReportAction }    from "./actions/create-report.action";
export { updateWidgetAction }    from "./actions/update-widget.action";
