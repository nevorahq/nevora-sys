import "server-only";

import { getServiceRoleClient } from "@/lib/supabase/service-role";

export interface GmailConnection {
  id: string;
  organizationId: string;
  userId: string;
  gmailAddress: string;
  refreshTokenCiphertext: string;
  scopes: string[];
  updatedAt: string;
}

function requireServiceClient() {
  const client = getServiceRoleClient();
  if (!client) throw new Error("The server credential store is not configured.");
  return client;
}

export async function getGmailConnection(
  organizationId: string,
  userId: string,
): Promise<GmailConnection | null> {
  const { data, error } = await requireServiceClient()
    .from("gmail_connections")
    .select("id, organization_id, user_id, gmail_address, refresh_token_ciphertext, scopes, updated_at")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("The Gmail connection could not be read.");
  if (!data) return null;
  return {
    id: data.id as string,
    organizationId: data.organization_id as string,
    userId: data.user_id as string,
    gmailAddress: data.gmail_address as string,
    refreshTokenCiphertext: data.refresh_token_ciphertext as string,
    scopes: (data.scopes as string[] | null) ?? [],
    updatedAt: data.updated_at as string,
  };
}

export async function saveGmailConnection(input: {
  organizationId: string;
  userId: string;
  gmailAddress: string;
  refreshTokenCiphertext: string;
  scopes: string[];
}): Promise<void> {
  const { error } = await requireServiceClient().from("gmail_connections").upsert({
    organization_id: input.organizationId,
    user_id: input.userId,
    gmail_address: input.gmailAddress,
    refresh_token_ciphertext: input.refreshTokenCiphertext,
    scopes: input.scopes,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,user_id" });
  if (error) throw new Error("The Gmail connection could not be saved.");
}

export async function deleteGmailConnection(organizationId: string, userId: string): Promise<void> {
  const { error } = await requireServiceClient()
    .from("gmail_connections")
    .delete()
    .eq("organization_id", organizationId)
    .eq("user_id", userId);
  if (error) throw new Error("The Gmail connection could not be removed.");
}

export interface GmailImportClaim {
  id: string;
  status: "importing" | "imported";
  documentId: string | null;
}

export async function claimGmailInvoiceImport(input: {
  organizationId: string;
  userId: string;
  subscriptionId: string;
  messageId: string;
  attachmentKey: string;
}): Promise<{ claimed: true; claim: GmailImportClaim } | { claimed: false; claim: GmailImportClaim }> {
  const client = requireServiceClient();
  const id = crypto.randomUUID();
  const { error } = await client.from("gmail_invoice_imports").insert({
    id,
    organization_id: input.organizationId,
    user_id: input.userId,
    subscription_id: input.subscriptionId,
    gmail_message_id: input.messageId,
    gmail_attachment_key: input.attachmentKey,
    status: "importing",
  });

  if (!error) return { claimed: true, claim: { id, status: "importing", documentId: null } };
  if (error.code !== "23505") throw new Error("The Gmail import could not be started.");

  const { data, error: readError } = await client
    .from("gmail_invoice_imports")
    .select("id, status, document_id")
    .eq("organization_id", input.organizationId)
    .eq("subscription_id", input.subscriptionId)
    .eq("gmail_message_id", input.messageId)
    .eq("gmail_attachment_key", input.attachmentKey)
    .single();
  if (readError || !data) throw new Error("The existing Gmail import could not be read.");
  return {
    claimed: false,
    claim: {
      id: data.id as string,
      status: data.status as "importing" | "imported",
      documentId: (data.document_id as string | null) ?? null,
    },
  };
}

export async function completeGmailInvoiceImport(claimId: string, documentId: string): Promise<void> {
  const { error } = await requireServiceClient()
    .from("gmail_invoice_imports")
    .update({ status: "imported", document_id: documentId, completed_at: new Date().toISOString() })
    .eq("id", claimId);
  if (error) throw new Error("The Gmail import could not be finalized.");
}

export async function releaseGmailInvoiceImport(claimId: string): Promise<void> {
  await requireServiceClient().from("gmail_invoice_imports").delete().eq("id", claimId).eq("status", "importing");
}
