import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";
import { hasDocumentPermission } from "@/modules/documents/services/document-permissions";
import { createTaskDocumentWithAttachments } from "@/modules/documents/services/create-task-document-with-attachments";

export const runtime = "nodejs";

/**
 * Creates the draft document + attachments for an already-created task.
 *
 * The task itself is created by `createTodoAction`; this route runs only when
 * the user attached files, so a task-linked document is created exclusively
 * here. Keeping uploads in a Node route (not the Server Action) avoids the
 * Server Action body-size limit for multi-megabyte files.
 */
export async function POST(request: Request, context: RouteContext<"/api/tasks/[taskId]/document">) {
  try {
    const { taskId } = await context.params;
    const parsedId = uuidSchema.safeParse(taskId);
    if (!parsedId.success) return NextResponse.json({ error: "Invalid task." }, { status: 400 });

    // Creating the task document + uploading files is a write. requireAppAccess
    // denies it (typed AccessError) for non-writable orgs before any storage
    // side effect; the underlying tables' RLS enforces the same.
    const ctx = await requireAppAccess({ permission: "data.write", capability: "documents", intent: "write" });
    if (!hasDocumentPermission(ctx, "document.create") || !hasDocumentPermission(ctx, "document.attachment.upload")) {
      return NextResponse.json({ error: "You do not have permission to create documents." }, { status: 403 });
    }

    const formData = await request.formData();
    const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);

    const supabase = await createClient();
    const result = await createTaskDocumentWithAttachments({ supabase, ctx, taskId: parsedId.data, files });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    revalidatePath(ROUTES.documents);
    return NextResponse.json({ documentId: result.documentId, attachments: result.attachments });
  } catch (error) {
    if (isAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.httpStatus });
    }
    console.error("task document upload: unexpected failure", error);
    return NextResponse.json({ error: "We could not finish the upload. Please try again." }, { status: 500 });
  }
}
