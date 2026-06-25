"use server";

import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import {
  getAutomationLogsSchema,
  type AutomationLogStatus,
} from "./automation-log.schema";

export interface AutomationLog {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  automation_name: string;
  automation_event: string;
  trigger_event_id: string | null;
  status: AutomationLogStatus;
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown>;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
}

const AUTOMATION_LOG_COLUMNS =
  "id, organization_id, workspace_id, automation_name, automation_event, trigger_event_id, status, input_payload, output_payload, error_message, created_by, created_at" as const;

export interface GetAutomationLogsInput {
  status?: AutomationLogStatus;
  triggerEventId?: string;
  limit?: number;
}

export type GetAutomationLogsResult =
  | { ok: true; data: AutomationLog[] }
  | { ok: false; error: string };

/**
 * Прочитать логи автоматизаций текущей org.
 * Scope по organization_id + RLS. Требует permission automation.read.
 */
export async function getAutomationLogs(
  input: GetAutomationLogsInput = {},
): Promise<GetAutomationLogsResult> {
  const parsed = getAutomationLogsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid query",
    };
  }

  const ctx = await requireOrg();
  if (!canDo(ctx, "automation.read")) {
    return { ok: false, error: "Forbidden" };
  }

  const supabase = await createClient();

  let query = supabase
    .from("automation_audit_logs")
    .select(AUTOMATION_LOG_COLUMNS)
    .eq("organization_id", ctx.org.id);

  if (parsed.data.status) {
    query = query.eq("status", parsed.data.status);
  }
  if (parsed.data.triggerEventId) {
    query = query.eq("trigger_event_id", parsed.data.triggerEventId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(parsed.data.limit);

  if (error) {
    console.error("[getAutomationLogs] failed:", error.message);
    return { ok: false, error: "Failed to load automation logs" };
  }

  return { ok: true, data: (data ?? []) as AutomationLog[] };
}
