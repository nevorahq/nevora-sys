import { z } from "zod";
import { PERIOD_TYPES, WIDGET_TYPES, WIDGET_DATA_SOURCES, REPORT_TYPES } from "../constants/analytics.constants";

export const createSnapshotSchema = z.object({
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  periodType:   z.enum(PERIOD_TYPES),
  workspaceId:  z.string().uuid().optional(),
});
export type CreateSnapshotInput = z.infer<typeof createSnapshotSchema>;

export const createWidgetSchema = z.object({
  name:        z.string().min(1).max(100),
  widgetType:  z.enum(WIDGET_TYPES),
  dataSource:  z.enum(WIDGET_DATA_SOURCES),
  config:      z.record(z.string(), z.unknown()).default({}),
  position:    z.number().int().min(0).default(0),
});
export type CreateWidgetInput = z.infer<typeof createWidgetSchema>;

export const updateWidgetSchema = z.object({
  widgetId:   z.string().uuid(),
  name:       z.string().min(1).max(100).optional(),
  config:     z.record(z.string(), z.unknown()).optional(),
  position:   z.number().int().min(0).optional(),
  isVisible:  z.boolean().optional(),
});
export type UpdateWidgetInput = z.infer<typeof updateWidgetSchema>;

export const createReportSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  reportType:  z.enum(REPORT_TYPES),
  parameters:  z.record(z.string(), z.unknown()).default({}),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

export const getMetricsSchema = z.object({
  days:        z.number().int().min(1).max(365).default(30),
  workspaceId: z.string().uuid().optional(),
});
export type GetMetricsInput = z.infer<typeof getMetricsSchema>;
