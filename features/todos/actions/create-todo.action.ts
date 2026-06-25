"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { checkPlanLimit } from "@/lib/billing";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { getTodoSchemas } from "../schemas/todo.schema";
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

  const [taskLimit, documentLimit] = await Promise.all([
    checkPlanLimit(org.id, "tasks"),
    checkPlanLimit(org.id, "documents"),
  ]);
  if (!taskLimit.allowed || !documentLimit.allowed) {
    return { error: taskLimit.reason ?? documentLimit.reason ?? dict.todos.errors.createFailed };
  }

  const rawData = {
    title: formData.get("title") as string,
    description: (formData.get("description") as string) || "",
    priority: formData.get("priority") as string,
    due_date: (formData.get("due_date") as string) || null,
    recurrence: (formData.get("recurrence") as string) || "none",
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

  let createdDocumentId: string | undefined;
  try {
    const supabase = await createClient();

    const { data: task, error } = await supabase.from("todos").insert({
      organization_id: org.id,
      workspace_id: workspace.id,
      created_by: user.id,
      updated_by: user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      due_date: parsed.data.due_date,
      recurrence: parsed.data.recurrence,
    }).select("id").single();

    if (error || !task) {
      console.error("createTodo error:", error);
      return { error: dict.todos.errors.createFailed };
    }

    const taskDocumentContent = [
      parsed.data.description.trim(),
      `Priority: ${parsed.data.priority}`,
      parsed.data.due_date ? `Due date: ${parsed.data.due_date}` : null,
      parsed.data.recurrence === "monthly" ? "Recurring: monthly" : null,
    ].filter(Boolean).join("\n\n");

    const { data: document, error: documentError } = await supabase
      .from("documents")
      .insert({
        organization_id: org.id,
        workspace_id: workspace.id,
        title: parsed.data.title,
        content: taskDocumentContent,
        doc_type: "note",
        status: "draft",
        entity_type: "task",
        entity_id: task.id,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();

    if (documentError || !document) {
      // Keep task/document creation all-or-nothing from the user's perspective.
      await supabase
        .from("todos")
        .update({ deleted_at: new Date().toISOString(), updated_by: user.id })
        .eq("id", task.id)
        .eq("organization_id", org.id);
      console.error("createTodo document creation error:", documentError);
      return { error: "The task document could not be created. Please try again." };
    }
    createdDocumentId = document.id;

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        workspaceId: workspace.id,
        eventName: "task.created",
        aggregateType: "task",
        aggregateId: task.id,
        payload: { title: parsed.data.title, priority: parsed.data.priority, due_date: parsed.data.due_date },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType: "todos",
        entityId: task.id,
        action: "create",
        newData: { title: parsed.data.title, priority: parsed.data.priority },
        metadata: { source: "dashboard" },
      }),
      emitDomainEvent({
        organizationId: org.id,
        workspaceId: workspace.id,
        eventName: "document.created",
        aggregateType: "document",
        aggregateId: document.id,
        payload: { title: parsed.data.title },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType: "documents",
        entityId: document.id,
        action: "create",
        newData: { title: parsed.data.title, entity_type: "task", entity_id: task.id },
        metadata: { source: "dashboard", trigger: "task_creation" },
      }),
    ]);
  } catch (err) {
    console.error("createTodo unexpected error:", err);
    return { error: dict.todos.errors.serverError };
  }

  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.tasks);
  revalidatePath(ROUTES.documents);
  return createdDocumentId ? { documentId: createdDocumentId } : { error: dict.todos.errors.createFailed };
}
