import type { SupabaseClient } from "@supabase/supabase-js";
import type { TasksRequestContext } from "@nevora/tasks-api";
import type { SubscriptionsRequestContext } from "@nevora/subscriptions-api";
import type {
  SubscriptionsAuditLog,
  SubscriptionsDomainEvent,
  SubscriptionsRuntimeEffects,
} from "@nevora/subscriptions-runtime";
import { createGeneratedTaskViaTasksService } from "./tasks-client";

export interface SubscriptionsEffectsEnvironment {
  tasksApiUrl: string;
  tasksServiceAuthSecret: string;
}

/**
 * Standalone infrastructure backed by the service-role client.
 *
 * `createGeneratedTask` is the one effect this package cannot implement
 * itself: `todos` is Tasks-owned, and this is now a genuinely separate
 * deployment — there is no in-process `platform/task-lifecycle/server.ts` to
 * call. It reaches Tasks the same way any other external caller would: an
 * authenticated HTTP call (see `./tasks-client.ts`), signing a short-lived
 * Tasks service token with the secret this deployment shares with Tasks
 * (`TASKS_SERVICE_AUTH_SECRET`). This intentionally does NOT live in
 * `@nevora/subscriptions-runtime` — a portable package depending on another
 * product's package would recreate the coupling ADR 001 removed one layer
 * up; only a deployment's own composition root (this app, mirroring
 * `platform/*` in the root app) is allowed to wire two products together.
 *
 * `emitDomainEvent`, `emitAuditLog` and `linkSubscriptionToTask` stay
 * self-contained raw Supabase calls — `domain_events`, `audit_logs` and
 * `entity_links` are shared, unowned tables, the same reasoning
 * `@nevora/tasks-runtime`'s effects already rely on.
 */
export function createDatabaseSubscriptionsRuntimeEffects(
  supabase: SupabaseClient,
  context: Readonly<SubscriptionsRequestContext>,
  tasksEnvironment: SubscriptionsEffectsEnvironment,
): SubscriptionsRuntimeEffects {
  const tasksContext: TasksRequestContext = {
    organizationId: context.organizationId,
    workspaceId: context.workspaceId,
    actorId: context.actorId,
    permissions: context.permissions,
  };

  async function emitDomainEvent(event: SubscriptionsDomainEvent): Promise<void> {
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
    if (error) console.error("[subscriptions-app] domain event failed:", error.message);
  }

  async function emitAuditLog(entry: SubscriptionsAuditLog): Promise<void> {
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
    if (error) console.error("[subscriptions-app] audit log failed:", error.message);
  }

  return {
    // GeneratedTaskMutationResult ({ok:true,taskId}|{ok:false,error}) is the
    // exact same shape as CreateGeneratedTaskEffectResult — no adapter needed.
    // workspaceId is intentionally not forwarded — Tasks derives it from the
    // signed context, same as the in-process adapter does.
    createGeneratedTask: ({ title, dueDate }) =>
      createGeneratedTaskViaTasksService(tasksContext, { title, dueDate }, {
        baseUrl: tasksEnvironment.tasksApiUrl,
        serviceAuthSecret: tasksEnvironment.tasksServiceAuthSecret,
      }),

    emitDomainEvent,
    emitAuditLog,

    async linkSubscriptionToTask(link) {
      const { error } = await supabase.from("entity_links").insert({
        organization_id: context.organizationId,
        workspace_id: context.workspaceId,
        source_type: "subscription",
        source_id: link.subscriptionId,
        target_type: "task",
        target_id: link.taskId,
        link_type: "renewal_task",
        status: "confirmed",
        source: "system",
        relation_direction: "bidirectional",
        metadata: { source: "auto", matched_by: ["subscription_payment_cycle"], cycle_id: link.cycleId },
        created_by: context.actorId,
      });
      if (error) console.error("[subscriptions-app] entity link failed:", error.message);
    },
  };
}
