"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { ROUTES, projectDetailUrl } from "@/shared/config/routes";
import { archiveProjectSchema } from "../schemas/project.schema";

/**
 * Soft-archive a project (status='archived' + archived_at=now).
 *
 * Archive is an UPDATE, never a hard DELETE — there is no DELETE RLS policy on
 * projects. data.delete gates the action (mirrors can_delete_data: manager+).
 * Tasks keep their project_id; the project simply leaves the active lists.
 */
export async function archiveProjectAction(
  projectId: string,
): Promise<{ error?: string }> {
  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "data.delete", intent: "write" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }
  const { user, org, workspace, permissions } = ctx;

  if (!permissions.has("data.delete")) {
    return { error: "You do not have permission to archive projects." };
  }

  const parsed = archiveProjectSchema.safeParse({ projectId });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("projects")
      .select("id, name, archived_at")
      .eq("id", parsed.data.projectId)
      .eq("organization_id", org.id)
      .maybeSingle();

    if (fetchError || !existing) {
      return { error: "Project not found" };
    }
    if (existing.archived_at) {
      return {}; // already archived — idempotent
    }

    const { error } = await supabase
      .from("projects")
      .update({
        status: "archived",
        archived_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("id", parsed.data.projectId)
      .eq("organization_id", org.id);

    if (error) {
      console.error("archiveProject error:", error);
      return { error: "Failed to archive project" };
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        workspaceId:    workspace.id,
        eventName:      "project.archived",
        aggregateType:  "project",
        aggregateId:    parsed.data.projectId,
        payload:        { name: existing.name as string },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "projects",
        entityId:       parsed.data.projectId,
        action:         "update",
        newData:        { archived: true },
        metadata:       { source: "dashboard", operation: "archive" },
      }),
    ]);
  } catch (err) {
    console.error("archiveProject unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.projects);
  revalidatePath(projectDetailUrl(parsed.data.projectId));
  return {};
}
