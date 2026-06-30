"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { checkPlanLimit } from "@/lib/billing";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { getTodoSchemas } from "../schemas/todo.schema";
import { recalculateProjectProgress } from "@/modules/tasks/projects/services/recalculate-project-progress";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

/**
 * Server Action: создать новый todo.
 *
 * Таблица `todos` стала org-scoped (миграция 004: organization_id NOT NULL),
 * поэтому требуется org-контекст. Раньше action писал только user_id — INSERT
 * падал на NOT NULL organization_id ("Не удалось создать задачу").
 *
 * 1. requireOrg() — org + workspace + user
 * 2. checkPlanLimit('tasks') — дружелюбное сообщение для trial / лимита плана
 * 3. Zod validation
 * 4. Supabase INSERT (RLS can_write_data — реальный guard, в т.ч. trial write-lock)
 * 5. revalidatePath — обновить Server Component
 */
export async function createTodoAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { dict } = await getDictionary();
  const { createTodoSchema } = getTodoSchemas(dict.todos.errors);

  const { user, org, workspace } = await requireOrg();

  // Only the task plan limit gates creation here. The `documents` limit is
  // checked later, and only when the user actually attached a file (see
  // createTaskDocumentWithAttachments) — a file-less task must never be blocked
  // by, or consume, the documents quota.
  const taskLimit = await checkPlanLimit(org.id, "tasks");
  if (!taskLimit.allowed) {
    return { error: taskLimit.reason ?? dict.todos.errors.createFailed };
  }

  const rawData = {
    title: formData.get("title") as string,
    description: (formData.get("description") as string) || "",
    priority: formData.get("priority") as string,
    // Срок исполнения при создании не устанавливается. Дата назначается
    // отдельным действием (updateTaskDueDate) после перевода задачи в работу.
    due_date: null,
    recurrence: (formData.get("recurrence") as string) || "none",
    project_id: (formData.get("project_id") as string) || "",
  };

  const parsed = createTodoSchema.safeParse(rawData);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  let createdTaskId: string;
  try {
    const supabase = await createClient();
    const taskId = randomUUID();

    // A project_id from the form is never trusted: it must resolve to a live
    // project in the SAME org and workspace, otherwise the task is created
    // without a project rather than leaking across tenants.
    let projectId: string | null = null;
    if (parsed.data.project_id) {
      const { data: project } = await supabase
        .from("projects")
        .select("id, workspace_id, archived_at")
        .eq("id", parsed.data.project_id)
        .eq("organization_id", org.id)
        .maybeSingle();
      if (project && !project.archived_at && project.workspace_id === workspace.id) {
        projectId = project.id as string;
      }
    }

    // Не используем INSERT ... RETURNING: приватная todos SELECT-policy
    // проверяется до AFTER INSERT trigger, который назначает автора, и поэтому
    // Postgres отклоняет новую строку с 42501. UUID генерируем заранее.
    const { error } = await supabase.from("todos").insert({
      id: taskId,
      organization_id: org.id,
      workspace_id: workspace.id,
      created_by: user.id,
      updated_by: user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      status: "todo", // новая задача всегда стартует со статусом "Не определён"
      due_date: parsed.data.due_date,
      recurrence: parsed.data.recurrence,
      project_id: projectId,
    });

    if (error) {
      console.error("createTodo error:", error);
      return { error: dict.todos.errors.createFailed };
    }
    createdTaskId = taskId;

    // New task may belong to a project — refresh that project's progress.
    await recalculateProjectProgress(supabase, projectId);

    // The task is always created. The draft document + attachments are created
    // separately, and only when the user attached at least one file (the client
    // uploads to /api/tasks/[taskId]/document). A file-less task therefore never
    // produces a `documents` row and never shows up in Drafts.
    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        workspaceId: workspace.id,
        eventName: "task.created",
        aggregateType: "task",
        aggregateId: taskId,
        payload: { title: parsed.data.title, priority: parsed.data.priority, due_date: parsed.data.due_date },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType: "todos",
        entityId: taskId,
        action: "create",
        newData: { title: parsed.data.title, priority: parsed.data.priority },
        metadata: { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("createTodo unexpected error:", err);
    return { error: dict.todos.errors.serverError };
  }

  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.tasks);
  revalidatePath(ROUTES.projects);
  revalidatePath(ROUTES.documents);
  return { taskId: createdTaskId };
}
