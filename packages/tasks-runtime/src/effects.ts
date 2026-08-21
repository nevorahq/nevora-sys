import type { SupabaseClient } from "@supabase/supabase-js";
import type { TasksRequestContext } from "@nevora/tasks-api";

export interface TasksDomainEvent {
  eventName: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

export interface TasksAuditLog {
  entityType: string;
  entityId: string;
  action: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface DocumentTaskLink {
  documentId: string;
  taskId: string;
  contextType: string;
  confidence?: number | null;
}

/** Platform effects needed by task creation, injected by each deployment. */
export interface TasksRuntimeEffects {
  reserveTaskUsage(): Promise<void>;
  releaseTaskUsage(): Promise<void>;
  emitDomainEvent(event: TasksDomainEvent): Promise<void>;
  emitAuditLog(entry: TasksAuditLog): Promise<void>;
  createDocumentTaskLink(link: DocumentTaskLink): Promise<void>;
}

/**
 * Standalone infrastructure backed by the service-role client.
 *
 * All tenant values come from an already verified TasksRequestContext. The
 * service-only usage RPC repeats active-membership validation in PostgreSQL.
 */
export function createDatabaseTasksRuntimeEffects(
  supabase: SupabaseClient,
  context: Readonly<TasksRequestContext>,
): TasksRuntimeEffects {
  async function emitDomainEvent(event: TasksDomainEvent): Promise<void> {
    const { error } = await supabase.from("domain_events").insert({
      organization_id: context.organizationId,
      workspace_id: context.workspaceId,
      event_name: event.eventName,
      aggregate_type: event.aggregateType,
      aggregate_id: event.aggregateId,
      payload: event.payload,
      created_by: context.actorId,
      version: 1,
    });
    if (error) console.error("[tasks-runtime] domain event failed:", error.message);
  }

  async function emitAuditLog(entry: TasksAuditLog): Promise<void> {
    const { error } = await supabase.from("audit_logs").insert({
      organization_id: context.organizationId,
      user_id: context.actorId,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      action: entry.action,
      old_data: entry.oldData ?? null,
      new_data: entry.newData ?? null,
      metadata: entry.metadata ?? {},
    });
    if (error) console.error("[tasks-runtime] audit log failed:", error.message);
  }

  return {
    async reserveTaskUsage() {
      const { error } = await supabase.rpc("reserve_tasks_usage_for_service", {
        p_organization_id: context.organizationId,
        p_actor_id: context.actorId,
        p_increment: 1,
      });
      if (error) {
        if (error.message.includes("plan_limit_exceeded")) {
          throw new Error(limitReachedMessage(error));
        }
        if (error.message.includes("subscription_not_writable")) {
          throw new Error(
            "Your trial or subscription no longer allows write actions. Reads remain available.",
          );
        }
        throw new Error(error.message);
      }
    },

    async releaseTaskUsage() {
      const { error } = await supabase.rpc("release_tasks_usage_for_service", {
        p_organization_id: context.organizationId,
        p_actor_id: context.actorId,
        p_decrement: 1,
      });
      if (error) console.error("[tasks-runtime] usage release failed:", error.message);
    },

    emitDomainEvent,
    emitAuditLog,

    async createDocumentTaskLink(link) {
      const [document, task] = await Promise.all([
        supabase
          .from("documents")
          .select("id")
          .eq("id", link.documentId)
          .eq("organization_id", context.organizationId)
          .maybeSingle(),
        supabase
          .from("todos")
          .select("id")
          .eq("id", link.taskId)
          .eq("organization_id", context.organizationId)
          .maybeSingle(),
      ]);
      if (!document.data || !task.data) {
        console.error("[tasks-runtime] document/task link rejected: tenant mismatch");
        return;
      }

      const metadata = {
        source: "auto",
        confidence: link.confidence ?? undefined,
        matched_by: ["financial_obligation"],
        context_type: link.contextType,
        status: "confirmed",
      };
      const { data, error } = await supabase
        .from("entity_links")
        .insert({
          organization_id: context.organizationId,
          workspace_id: context.workspaceId,
          source_type: "document",
          source_id: link.documentId,
          target_type: "task",
          target_id: link.taskId,
          link_type: "requires_action_task",
          status: "confirmed",
          source: "system",
          confidence_score: link.confidence ?? null,
          relation_direction: "direct",
          metadata,
          created_by: context.actorId,
        })
        .select("id")
        .single();

      if (error) {
        if (error.code !== "23505") {
          console.error("[tasks-runtime] document/task link failed:", error.message);
        }
        return;
      }

      const eventPayload = {
        source_entity_type: "document",
        source_entity_id: link.documentId,
        target_entity_type: "task",
        target_entity_id: link.taskId,
        relation_type: "requires_action_task",
        source: "system",
        confidence: link.confidence ?? 0,
        matched_by: ["financial_obligation"],
      };
      await Promise.all([
        emitDomainEvent({
          eventName: "relation.auto_created",
          aggregateType: "entity_relation",
          aggregateId: data.id as string,
          payload: eventPayload,
        }),
        emitAuditLog({
          entityType: "relation",
          entityId: data.id as string,
          action: "create",
          newData: eventPayload,
          metadata: { source: "system", relation_source: "system" },
        }),
      ]);
    },
  };
}

function limitReachedMessage(error: { message?: string; details?: string | null }): string {
  const source = `${error.details ?? ""} ${error.message ?? ""}`;
  const current = source.match(/current=(\d+(?:\.\d+)?)/);
  const limit = source.match(/limit=(\d+(?:\.\d+)?)/);
  if (current && limit) {
    return `You've reached your plan's task limit — ${current[1]} of ${limit[1]} used. Upgrade your plan to add more.`;
  }
  return "You've reached your plan's task limit. Upgrade your plan to add more.";
}
