"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { createProjectSchema } from "../schemas/project.schema";
import { generateUniqueProjectSlug } from "../services/generate-project-slug";

/**
 * Create a project inside the current org + workspace.
 *
 * Security: requireOrg() resolves a trusted org/workspace; we never read
 * organization_id/workspace_id from the client. data.write is the permission
 * gate (mirrors can_write_data RLS). The pre-generated UUID avoids
 * INSERT...RETURNING racing the project SELECT policy.
 *
 * Returns the new project id in `taskId` (the shared ActionResult slot) so the
 * client can redirect to the detail page.
 */
export async function createProjectAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, org, workspace, permissions } = await requireOrg();

  if (!permissions.has("data.write")) {
    return { error: "You do not have permission to create projects." };
  }

  const parsed = createProjectSchema.safeParse({
    name:        formData.get("name") as string,
    description: (formData.get("description") as string) || "",
    status:      (formData.get("status") as string) || "active",
    priority:    (formData.get("priority") as string) || "medium",
    start_date:  (formData.get("start_date") as string) || "",
    due_date:    (formData.get("due_date") as string) || "",
    color:       (formData.get("color") as string) || "",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  let projectId: string;
  try {
    const supabase = await createClient();
    projectId = randomUUID();
    const slug = await generateUniqueProjectSlug(supabase, workspace.id, parsed.data.name);

    const { error } = await supabase.from("projects").insert({
      id:              projectId,
      organization_id: org.id,
      workspace_id:    workspace.id,
      name:            parsed.data.name,
      slug,
      description:     parsed.data.description,
      status:          parsed.data.status,
      priority:        parsed.data.priority,
      owner_id:        user.id,
      start_date:      parsed.data.start_date,
      due_date:        parsed.data.due_date,
      color:           parsed.data.color,
      created_by:      user.id,
      updated_by:      user.id,
    });

    if (error) {
      console.error("createProject error:", error);
      if (error.code === "23505") {
        return { fieldErrors: { name: ["A project with a similar name already exists."] } };
      }
      return { error: "Failed to create project" };
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        workspaceId:    workspace.id,
        eventName:      "project.created",
        aggregateType:  "project",
        aggregateId:    projectId,
        payload: {
          name:     parsed.data.name,
          slug,
          status:   parsed.data.status,
          priority: parsed.data.priority,
        },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "projects",
        entityId:       projectId,
        action:         "create",
        newData: {
          name:     parsed.data.name,
          status:   parsed.data.status,
          priority: parsed.data.priority,
        },
        metadata: { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("createProject unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.projects);
  return { taskId: projectId };
}
