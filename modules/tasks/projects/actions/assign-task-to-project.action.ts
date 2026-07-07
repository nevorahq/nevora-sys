"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { ROUTES, projectDetailUrl } from "@/shared/config/routes";
import { assignTaskToProjectSchema } from "../schemas/project.schema";
import { recalculateProjectProgress } from "../services/recalculate-project-progress";

/**
 * Assign a task to a project, or detach it (projectId = null).
 *
 * Cross-tenant safety (the core guard for this feature):
 *   - The task is re-fetched scoped to org.id — a task id from another tenant
 *     resolves to null and is rejected.
 *   - When assigning, the project is re-fetched scoped to the SAME org.id AND
 *     the same workspace_id as the task. A task can never be attached to a
 *     project from another organization or workspace.
 *
 * Progress is recomputed server-side for every project whose membership changed
 * (the old project loses the task, the new project gains it).
 */
export async function assignTaskToProjectAction(
  taskId: string,
  projectId: string | null,
): Promise<{ error?: string }> {
  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }
  const { user, org, workspace, permissions } = ctx;

  if (!permissions.has("data.write")) {
    return { error: "You do not have permission to modify tasks." };
  }

  const parsed = assignTaskToProjectSchema.safeParse({ taskId, projectId });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const supabase = await createClient();

    const { data: task, error: taskError } = await supabase
      .from("todos")
      .select("id, title, project_id, workspace_id")
      .eq("id", parsed.data.taskId)
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (taskError || !task) {
      return { error: "Task not found" };
    }

    const previousProjectId = (task.project_id as string | null) ?? null;
    const nextProjectId = parsed.data.projectId;

    if (previousProjectId === nextProjectId) {
      return {}; // no-op
    }

    // When assigning, verify the project belongs to the same org AND workspace.
    if (nextProjectId) {
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id, workspace_id, archived_at")
        .eq("id", nextProjectId)
        .eq("organization_id", org.id)
        .maybeSingle();

      if (projectError || !project) {
        return { error: "Project not found" };
      }
      if (project.archived_at) {
        return { error: "Cannot assign tasks to an archived project." };
      }
      if (project.workspace_id !== task.workspace_id) {
        return { error: "Task and project must be in the same workspace." };
      }
    }

    const { error } = await supabase
      .from("todos")
      .update({ project_id: nextProjectId, updated_by: user.id })
      .eq("id", parsed.data.taskId)
      .eq("organization_id", org.id);

    if (error) {
      console.error("assignTaskToProject error:", error);
      return { error: "Failed to update task" };
    }

    // Recompute progress for both affected projects.
    await Promise.all([
      recalculateProjectProgress(supabase, previousProjectId),
      recalculateProjectProgress(supabase, nextProjectId),
    ]);

    const eventName = nextProjectId ? "task.assigned_to_project" : "task.removed_from_project";
    const affectedProjectId = nextProjectId ?? previousProjectId!;

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        workspaceId:    workspace.id,
        eventName,
        aggregateType:  "task",
        aggregateId:    task.id as string,
        payload: {
          task_id:    task.id as string,
          project_id: affectedProjectId,
          title:      task.title as string,
        },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "todos",
        entityId:       task.id as string,
        action:         nextProjectId ? "assign" : "unassign",
        oldData:        { project_id: previousProjectId },
        newData:        { project_id: nextProjectId },
        metadata:       { source: "dashboard", operation: "project_assignment" },
      }),
    ]);
  } catch (err) {
    console.error("assignTaskToProject unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.tasks);
  revalidatePath(ROUTES.projects);
  if (projectId) revalidatePath(projectDetailUrl(projectId));
  return {};
}

/** Convenience wrapper: detach a task from its current project. */
export async function removeTaskFromProjectAction(
  taskId: string,
): Promise<{ error?: string }> {
  return assignTaskToProjectAction(taskId, null);
}
