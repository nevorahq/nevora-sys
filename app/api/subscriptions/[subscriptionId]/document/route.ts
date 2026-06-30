import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/require-org";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";
import { hasDocumentPermission } from "@/modules/documents/services/document-permissions";
import { createSubscriptionDocumentWithAttachments } from "@/modules/documents/services/create-subscription-document-with-attachments";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ subscriptionId: string }> },
) {
  try {
    const { subscriptionId } = await context.params;
    const parsedId = uuidSchema.safeParse(subscriptionId);
    if (!parsedId.success) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });

    const ctx = await requireOrg();
    if (!hasDocumentPermission(ctx, "document.create") || !hasDocumentPermission(ctx, "document.attachment.upload")) {
      return NextResponse.json({ error: "You do not have permission to create documents." }, { status: 403 });
    }

    const formData = await request.formData();
    const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const supabase = await createClient();
    const result = await createSubscriptionDocumentWithAttachments({
      supabase,
      ctx,
      subscriptionId: parsedId.data,
      files,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    revalidatePath(ROUTES.documents);
    revalidatePath(`${ROUTES.subscriptions}/${parsedId.data}`);
    return NextResponse.json({
      documentId: result.documentId,
      attachments: result.attachments,
      relationCreated: result.relationCreated,
      warning: result.warning,
    });
  } catch (error) {
    console.error("subscription document upload: unexpected failure", error);
    return NextResponse.json({ error: "We could not finish the upload. Please try again." }, { status: 500 });
  }
}
