"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  createAutomationLogSchema,
  type CreateAutomationLogParsed,
} from "./automation-log.schema";

export interface CreateAutomationLogInput {
  organizationId: string;
  workspaceId?: string | null;
  automationName: string;
  automationEvent: string;
  triggerEventId?: string | null;
  status: CreateAutomationLogParsed["status"];
  inputPayload?: Record<string, unknown>;
  outputPayload?: Record<string, unknown>;
  errorMessage?: string | null;
}

/**
 * Записать строку в automation_audit_logs.
 *
 * Вызывается движком dispatchDomainEvent() после каждого хендлера.
 * Как и emitDomainEvent — НЕ бросает наружу: сбой записи лога не должен
 * ронять ни dispatch, ни исходное действие пользователя.
 *
 * created_by форсируется текущим auth-пользователем (RLS WITH CHECK).
 * organization_id whitelisted из input (берётся из серверного контекста
 * вызывающей стороны, не из клиентского payload).
 *
 * @returns id созданного лога или null при сбое.
 */
export async function createAutomationLog(
  input: CreateAutomationLogInput,
): Promise<string | null> {
  const parsed = createAutomationLogSchema.safeParse(input);
  if (!parsed.success) {
    console.error(
      "[createAutomationLog] invalid input:",
      parsed.error.issues[0]?.message,
    );
    return null;
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      console.error("[createAutomationLog] no authenticated user");
      return null;
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("automation_audit_logs")
      .insert({
        organization_id: parsed.data.organizationId,
        workspace_id: parsed.data.workspaceId ?? null,
        automation_name: parsed.data.automationName,
        automation_event: parsed.data.automationEvent,
        trigger_event_id: parsed.data.triggerEventId ?? null,
        status: parsed.data.status,
        input_payload: parsed.data.inputPayload ?? {},
        output_payload: parsed.data.outputPayload ?? {},
        error_message: parsed.data.errorMessage ?? null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[createAutomationLog] insert failed:", error.message);
      return null;
    }

    return data.id as string;
  } catch (err) {
    console.error("[createAutomationLog] unexpected error:", err);
    return null;
  }
}
