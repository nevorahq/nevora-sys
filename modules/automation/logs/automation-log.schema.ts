import { z } from "zod";
import { uuidSchema } from "@/lib/validators/common";

/**
 * Zod-схемы для automation_audit_logs.
 *
 * input_payload/output_payload ограничены по размеру через JSON-сериализацию,
 * чтобы не писать oversized-payload в лог.
 */

export const AUTOMATION_LOG_STATUSES = [
  "created",
  "executed",
  "failed",
  "skipped",
] as const;

export type AutomationLogStatus = (typeof AUTOMATION_LOG_STATUSES)[number];

const MAX_PAYLOAD_BYTES = 16_000;

const jsonPayloadSchema = z
  .record(z.string(), z.unknown())
  .default({})
  .refine(
    (v) => JSON.stringify(v).length <= MAX_PAYLOAD_BYTES,
    { message: "Payload is too large" },
  );

export const createAutomationLogSchema = z.object({
  organizationId: uuidSchema,
  workspaceId: uuidSchema.nullish(),
  automationName: z.string().trim().min(1).max(120),
  automationEvent: z.string().trim().min(1).max(120),
  triggerEventId: uuidSchema.nullish(),
  status: z.enum(AUTOMATION_LOG_STATUSES),
  inputPayload: jsonPayloadSchema,
  outputPayload: jsonPayloadSchema,
  errorMessage: z.string().max(2000).nullish(),
});

export type CreateAutomationLogParsed = z.infer<typeof createAutomationLogSchema>;

export const getAutomationLogsSchema = z.object({
  status: z.enum(AUTOMATION_LOG_STATUSES).optional(),
  triggerEventId: uuidSchema.optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export type GetAutomationLogsParsed = z.infer<typeof getAutomationLogsSchema>;
