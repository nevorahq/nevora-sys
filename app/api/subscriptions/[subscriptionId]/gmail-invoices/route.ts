import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";
import { DOCUMENT_MAX_FILE_SIZE_BYTES } from "@/modules/documents/constants/document.constants";
import { hasDocumentPermission } from "@/modules/documents/services/document-permissions";
import { createSubscriptionDocumentWithAttachments } from "@/modules/documents/services/create-subscription-document-with-attachments";
import { getGmailAccessForUser } from "@/modules/integrations/gmail/gmail-credentials";
import { downloadGmailAttachment, searchSubscriptionInvoices } from "@/modules/integrations/gmail/gmail-api";
import {
  claimGmailInvoiceImport,
  completeGmailInvoiceImport,
  releaseGmailInvoiceImport,
} from "@/modules/integrations/gmail/gmail-store";
import { emitDomainEvent } from "@/lib/events";

export const runtime = "nodejs";

const importSchema = z.object({
  messageId: z.string().min(1).max(256),
  partId: z.string().min(1).max(256),
});

async function getSubscription(subscriptionId: string, organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("id, name, url")
    .eq("id", subscriptionId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return { supabase, subscription: data as { id: string; name: string; url: string | null } | null };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ subscriptionId: string }> },
) {
  try {
    const parsedId = uuidSchema.safeParse((await context.params).subscriptionId);
    if (!parsedId.success) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
    const ctx = await requireAppAccess({ intent: "read" });
    const { subscription } = await getSubscription(parsedId.data, ctx.org.id);
    if (!subscription) return NextResponse.json({ error: "Subscription not found." }, { status: 404 });

    const gmail = await getGmailAccessForUser(ctx.org.id, ctx.user.id);
    if (!gmail) return NextResponse.json({ error: "Connect Gmail before searching for invoices." }, { status: 409 });
    const result = await searchSubscriptionInvoices({ accessToken: gmail.accessToken, subscription });
    return NextResponse.json({
      candidates: result.candidates.map((candidate) => ({
        ...candidate,
        importable: candidate.size <= DOCUMENT_MAX_FILE_SIZE_BYTES,
      })),
    });
  } catch (error) {
    if (isAccessError(error)) return NextResponse.json({ error: error.message }, { status: error.httpStatus });
    console.error("Gmail invoice search failed", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Gmail invoice search failed.",
    }, { status: 502 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ subscriptionId: string }> },
) {
  let claimId: string | null = null;
  let documentCreated = false;
  try {
    const parsedId = uuidSchema.safeParse((await context.params).subscriptionId);
    if (!parsedId.success) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
    const input = importSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ error: "Invalid Gmail attachment." }, { status: 400 });

    const ctx = await requireAppAccess({ permission: "data.write", capability: "documents", intent: "write" });
    if (!hasDocumentPermission(ctx, "document.create") || !hasDocumentPermission(ctx, "document.attachment.upload")) {
      return NextResponse.json({ error: "You do not have permission to import documents." }, { status: 403 });
    }
    const { supabase, subscription } = await getSubscription(parsedId.data, ctx.org.id);
    if (!subscription) return NextResponse.json({ error: "Subscription not found." }, { status: 404 });

    const claim = await claimGmailInvoiceImport({
      organizationId: ctx.org.id,
      userId: ctx.user.id,
      subscriptionId: parsedId.data,
      messageId: input.data.messageId,
      attachmentKey: input.data.partId,
    });
    if (!claim.claimed) {
      if (claim.claim.status === "imported" && claim.claim.documentId) {
        return NextResponse.json({ documentId: claim.claim.documentId, alreadyImported: true });
      }
      return NextResponse.json({ error: "This invoice import is already in progress." }, { status: 409 });
    }
    claimId = claim.claim.id;

    const gmail = await getGmailAccessForUser(ctx.org.id, ctx.user.id);
    if (!gmail) return NextResponse.json({ error: "Connect Gmail before importing an invoice." }, { status: 409 });
    const attachment = await downloadGmailAttachment({
      accessToken: gmail.accessToken,
      messageId: input.data.messageId,
      partId: input.data.partId,
    });
    if (attachment.data.byteLength > DOCUMENT_MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "The Gmail attachment is larger than 10 MB." }, { status: 413 });
    }

    const file = new File([new Uint8Array(attachment.data)], attachment.filename, { type: attachment.mimeType });
    const result = await createSubscriptionDocumentWithAttachments({
      supabase,
      ctx,
      subscriptionId: parsedId.data,
      files: [file],
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    documentCreated = true;

    let warning = result.warning;
    try {
      await completeGmailInvoiceImport(claimId, result.documentId);
    } catch {
      warning = warning ?? "The invoice was imported, but its duplicate-import marker could not be finalized.";
    }
    await emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "subscription.invoice.linked",
      aggregateType: "subscription",
      aggregateId: parsedId.data,
      payload: {
        subscription_id: parsedId.data,
        document_id: result.documentId,
        source: "gmail",
        gmail_message_id: input.data.messageId,
      },
    });
    revalidatePath(ROUTES.documents);
    revalidatePath(`${ROUTES.subscriptions}/${parsedId.data}`);
    return NextResponse.json({
      documentId: result.documentId,
      relationCreated: result.relationCreated,
      warning,
      alreadyImported: false,
    });
  } catch (error) {
    if (isAccessError(error)) return NextResponse.json({ error: error.message }, { status: error.httpStatus });
    console.error("Gmail invoice import failed", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "The Gmail invoice could not be imported.",
    }, { status: 502 });
  } finally {
    if (claimId && !documentCreated) await releaseGmailInvoiceImport(claimId).catch(() => undefined);
  }
}
