import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppAccess, isAccessError, type AccessError } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { reportError } from "@/lib/observability/report-error";
import { ROUTES } from "@/shared/config/routes";
import { captureInboxDocument } from "@/modules/planner/services/capture-inbox-document";
import { generateCaptureTitle } from "@/modules/planner/utils/generate-capture-title";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

export const runtime = "nodejs";

const captureFormSchema = z.object({
  captureId: z.string().uuid("A capture id is required."),
  entryType: z.enum(["photo", "document"]),
  note: z.string().trim().max(5_000, "Note must be 5,000 characters or fewer.").optional().default(""),
});

/**
 * Binary Inbox capture endpoint (photo / document).
 *
 * Deliberately separate from the text `createPlannerEntryAction`: teaching a
 * Server Action to also stream files would blur the "text vs binary" boundary and
 * duplicate the Documents upload policy. This route stays thin — parse, delegate
 * to the orchestration service, revalidate the surfaces the capture touches.
 *
 * organization_id / workspace_id are resolved server-side from the session; the
 * client cannot influence tenancy.
 */
/** Access denials in the viewer's language: permission, quota, or plan state. */
function accessMessage(error: AccessError, dict: Dictionary): string {
  switch (error.code) {
    case "LIMIT_REACHED":
      return dict.inbox.errors.planLimit;
    case "AUTH_REQUIRED":
    case "ORG_REQUIRED":
    case "WORKSPACE_REQUIRED":
    case "MEMBERSHIP_REQUIRED":
    case "PERMISSION_DENIED":
    case "INVALID_TENANT_CONTEXT":
      return dict.inbox.errors.forbidden;
    default:
      return dict.access.blockedUpload;
  }
}

export async function POST(request: Request) {
  const { dict } = await getDictionary();
  const errors = dict.inbox.errors;
  try {
    const ctx = await requireAppAccess({ permission: "data.write", capability: "documents", intent: "write" });

    const formData = await request.formData();
    const parsed = captureFormSchema.safeParse({
      captureId: formData.get("captureId"),
      entryType: formData.get("entryType") || "document",
      note: formData.get("note") || "",
    });
    if (!parsed.success) {
      return NextResponse.json({ error: errors.invalid }, { status: 400 });
    }

    const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length === 0) {
      return NextResponse.json({ error: errors.noFiles }, { status: 400 });
    }

    const title = generateCaptureTitle({ filename: files[0]?.name, entryType: parsed.data.entryType });

    const supabase = await createClient();
    const result = await captureInboxDocument(supabase, ctx, {
      files,
      captureId: parsed.data.captureId,
      note: parsed.data.note,
      entryType: parsed.data.entryType,
      title,
    });

    if (!result.ok) {
      const message =
        result.code === "forbidden"
          ? errors.forbidden
          : result.code === "invalid_file"
            ? errors.invalidFile
            : result.code === "plan_limit"
              ? errors.planLimit
              : errors.captureFailed;
      return NextResponse.json(
        result.diagnosticId ? { error: message, diagnosticId: result.diagnosticId } : { error: message },
        { status: result.status },
      );
    }

    // A capture lands in the Inbox, stores a Document, and may raise a review
    // signal — revalidate all three surfaces so each reflects the new state.
    revalidatePath(ROUTES.inbox);
    revalidatePath(ROUTES.documents);
    revalidatePath(ROUTES.actions);

    return NextResponse.json({
      documentId: result.documentId,
      entryId: result.entryId,
      reused: result.reused,
      warning: result.warning === "saved_not_linked" ? errors.savedNotLinked : null,
    });
  } catch (error) {
    if (isAccessError(error)) {
      return NextResponse.json({ error: accessMessage(error, dict) }, { status: error.httpStatus });
    }
    const { diagnosticId } = reportError("inbox.capture.failed", error, {
      userMessage: errors.captureFailed,
    });
    return NextResponse.json({ error: errors.captureFailed, diagnosticId }, { status: 500 });
  }
}
