import type { CurrentContext } from "@/lib/context/current-context";
import type { TasksRequestContext } from "@nevora/tasks-api";

export function toTasksRuntimeContext(
  ctx: CurrentContext,
): Readonly<TasksRequestContext> {
  return Object.freeze({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    permissions: Object.freeze([...ctx.permissions]),
  });
}
