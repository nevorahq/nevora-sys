import "server-only";

import type { CurrentContext } from "@/lib/context/current-context";
import { createEntityLink } from "@/lib/entity-links";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import {
  releaseOrganizationUsage,
  reserveOrganizationUsage,
} from "@/platform/access/server";
import type {
  TasksAuditLog,
  TasksDomainEvent,
  TasksRuntimeEffects,
} from "@nevora/tasks-runtime";
export { toTasksRuntimeContext } from "./runtime-context";

/** Preserve root-only automation integrations while sharing Tasks business logic. */
export function createRootTasksRuntimeEffects(ctx: CurrentContext): TasksRuntimeEffects {
  return {
    async reserveTaskUsage() {
      await reserveOrganizationUsage(ctx.org.id, "tasks.count", 1);
    },
    async releaseTaskUsage() {
      await releaseOrganizationUsage(ctx.org.id, "tasks.count", 1);
    },
    async emitDomainEvent(event: TasksDomainEvent) {
      await emitDomainEvent({
        organizationId: ctx.org.id,
        workspaceId: ctx.workspace.id,
        ...event,
      } as never);
    },
    async emitAuditLog(entry: TasksAuditLog) {
      await emitAuditLog({ organizationId: ctx.org.id, ...entry } as never);
    },
    async createDocumentTaskLink(link) {
      await createEntityLink({
        sourceType: "document",
        sourceId: link.documentId,
        targetType: "task",
        targetId: link.taskId,
        linkType: "requires_action_task",
        relationDirection: "direct",
        metadata: {
          source: "auto",
          confidence: link.confidence ?? undefined,
          matched_by: ["financial_obligation"],
          context_type: link.contextType,
        },
      });
    },
  };
}
