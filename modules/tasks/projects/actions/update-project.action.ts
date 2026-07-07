"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { ROUTES, projectDetailUrl } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { updateProjectSchema } from "../schemas/project.schema";

/**
 * Update an existing project.
 *
 * Security: requireOrg() + data.write gate; the row is re-fetched scoped to
 * org.id so a project id from another tenant cannot be updated. Only validated,
 * allow-listed fields are written (no mass assignment). Marking status as
 * 'completed' stamps completed_at and emits project.completed.
 */
export async function updateProjectAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
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
    return { error: "You do not have permission to update projects." };
  }

  const parsed = updateProjectSchema.safeParse({
    projectId:   formData.get("projectId") as string,
    name:        formData.get("name") ?? undefined,
    description: formData.get("description") ?? undefined,
    status:      formData.get("status") ?? undefined,
    priority:    formData.get("priority") ?? undefined,
    start_date:  formData.get("start_date") ?? undefined,
    due_date:    formData.get("due_date") ?? undefined,
    color:       formData.get("color") ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  const { projectId, ...fields } = parsed.data;

  try {
    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("projects")
      .select("id, name, status, completed_at, archived_at")
      .eq("id", projectId)
      .eq("organization_id", org.id)
      .maybeSingle();

    if (fetchError || !existing) {
      return { error: "Project not found" };
    }
    if (existing.archived_at) {
      return { error: "Archived projects cannot be edited." };
    }

    // Build the update from validated fields only.
    const update: Record<string, unknown> = { updated_by: user.id };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) update[key] = value;
    }

    const becomingCompleted =
      fields.status === "completed" && existing.status !== "completed";
    if (becomingCompleted) {
      update.completed_at = new Date().toISOString();
    } else if (fields.status && fields.status !== "completed" && existing.completed_at) {
      update.completed_at = null;
    }

    const { error } = await supabase
      .from("projects")
      .update(update)
      .eq("id", projectId)
      .eq("organization_id", org.id);

    if (error) {
      console.error("updateProject error:", error);
      if (error.code === "23505") {
        return { fieldErrors: { name: ["A project with a similar name already exists."] } };
      }
      return { error: "Failed to update project" };
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        workspaceId:    workspace.id,
        eventName:      becomingCompleted ? "project.completed" : "project.updated",
        aggregateType:  "project",
        aggregateId:    projectId,
        payload: becomingCompleted
          ? { name: existing.name as string, completed_at: update.completed_at as string }
          : { ...fields },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "projects",
        entityId:       projectId,
        action:         becomingCompleted ? "status_change" : "update",
        oldData:        { status: existing.status },
        newData:        { ...fields },
        metadata:       { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("updateProject unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.projects);
  revalidatePath(projectDetailUrl(projectId));
  return {};
}
