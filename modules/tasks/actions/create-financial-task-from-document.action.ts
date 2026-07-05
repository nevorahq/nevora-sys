"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import { createFinancialTaskFromDocumentSchema } from "../schemas/financial-task.schema";
import { createFinancialTask } from "../services/create-financial-task";
import type { TaskContextType } from "../constants/task.constants";

/**
 * Server Action: confirm a detected obligation → create a Financial Context Task.
 *
 * Used by the document-detail "Create task" affordance (medium-confidence
 * suggestions the user reviews before acting). organization_id/workspace_id are
 * resolved from the server context — never from the payload. Money-safe: creates
 * a planned obligation task only, never a transaction.
 */
export async function createFinancialTaskFromDocumentAction(input: {
  sourceDocumentId: string;
  contextType: string;
  providerName?: string | null;
  amount?: number | null;
  currency?: string | null;
  financialDueDate: string;
  reminderOffsetDays?: number;
}): Promise<{ error?: string; taskId?: string; created?: boolean }> {
  const parsed = createFinancialTaskFromDocumentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const ctx = await requireOrg();
  if (!canDo(ctx, "todos.write")) {
    return { error: "You do not have permission to create tasks." };
  }

  const supabase = await createClient();

  // Verify the source document belongs to the active org (defense in depth on
  // top of RLS) before stitching a task to it.
  const { data: doc } = await supabase
    .from("documents")
    .select("id")
    .eq("id", parsed.data.sourceDocumentId)
    .eq("organization_id", ctx.org.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!doc) return { error: "Document not found" };

  const result = await createFinancialTask(supabase, ctx, {
    contextType: parsed.data.contextType as Exclude<TaskContextType, "standard">,
    providerName: parsed.data.providerName ?? null,
    amount: parsed.data.amount ?? null,
    currency: parsed.data.currency ?? null,
    financialDueDate: parsed.data.financialDueDate,
    reminderOffsetDays: parsed.data.reminderOffsetDays,
    sourceType: "document",
    sourceId: parsed.data.sourceDocumentId,
    sourceDocumentId: parsed.data.sourceDocumentId,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath(ROUTES.tasks);
  revalidatePath(ROUTES.documents);
  revalidatePath(`${ROUTES.documents}/${parsed.data.sourceDocumentId}`);
  return { taskId: result.taskId, created: result.created };
}
