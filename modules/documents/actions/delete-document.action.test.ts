import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
const hasDocumentPermission = vi.fn();
const emitDomainEvent = vi.fn();
const emitAuditLog = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrg }));
// Phase 2: actions now funnel through requireAppAccess; mock that boundary and
// delegate to the existing requireOrg fixture (the guard has its own tests).
vi.mock("@/lib/security", () => ({
  requireAppAccess: () => requireOrg(),
  accessErrorToActionResult: () => null,
  isAccessError: () => false,
}));
vi.mock("@/lib/events", () => ({ emitDomainEvent, emitAuditLog }));
vi.mock("../services/document-permissions", () => ({ hasDocumentPermission }));

const { deleteDocumentAction } = await import("./delete-document.action");

const DOCUMENT_ID = "94bd07e5-57b2-4766-bee7-7b97ac130f32";
const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";
const WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";

const maybeSingle = vi.fn();
const isDeletedAt = vi.fn(() => ({ maybeSingle }));
const organizationEq = vi.fn(() => ({ is: isDeletedAt }));
const documentEq = vi.fn(() => ({ eq: organizationEq }));
const select = vi.fn(() => ({ eq: documentEq }));
const fallbackIsDeletedAt = vi.fn(async () => ({ error: null }));
const fallbackOrganizationEq = vi.fn(() => ({ is: fallbackIsDeletedAt }));
const fallbackDocumentEq = vi.fn(() => ({ eq: fallbackOrganizationEq }));
const update = vi.fn(() => ({ eq: fallbackDocumentEq }));
const from = vi.fn(() => ({ select, update }));
const rpc = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  requireOrg.mockResolvedValue({
    user: { id: USER_ID },
    org: { id: ORGANIZATION_ID },
    workspace: { id: WORKSPACE_ID },
  });
  hasDocumentPermission.mockReturnValue(true);
  createClient.mockResolvedValue({ from, rpc });
  maybeSingle.mockResolvedValue({
    data: { id: DOCUMENT_ID, title: "Contract", workspace_id: WORKSPACE_ID },
    error: null,
  });
  rpc.mockResolvedValue({ data: DOCUMENT_ID, error: null });
  emitDomainEvent.mockResolvedValue(undefined);
  emitAuditLog.mockResolvedValue(undefined);
});

describe("deleteDocumentAction", () => {
  it("soft-deletes an active document and emits deletion side effects", async () => {
    await expect(deleteDocumentAction(DOCUMENT_ID)).resolves.toEqual({});

    expect(from).toHaveBeenCalledWith("documents");
    expect(documentEq).toHaveBeenCalledWith("id", DOCUMENT_ID);
    expect(organizationEq).toHaveBeenCalledWith("organization_id", ORGANIZATION_ID);
    expect(isDeletedAt).toHaveBeenCalledWith("deleted_at", null);
    expect(rpc).toHaveBeenCalledWith("soft_delete_document", {
      p_document_id: DOCUMENT_ID,
      p_organization_id: ORGANIZATION_ID,
    });
    expect(emitDomainEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventName: "document.deleted",
      workspaceId: WORKSPACE_ID,
      aggregateId: DOCUMENT_ID,
    }));
    expect(emitAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "documents",
      entityId: DOCUMENT_ID,
      action: "delete",
    }));
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/documents");
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/documents/${DOCUMENT_ID}`);
  });

  it("treats a repeat delete race as an idempotent success", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "document_not_found" } });

    await expect(deleteDocumentAction(DOCUMENT_ID)).resolves.toEqual({});

    expect(emitDomainEvent).not.toHaveBeenCalled();
    expect(emitAuditLog).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/documents");
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/documents/${DOCUMENT_ID}`);
  });

  it("keeps real RPC failures visible to the UI", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "forbidden" } });

    await expect(deleteDocumentAction(DOCUMENT_ID)).resolves.toEqual({
      error: "Your organization is read-only right now. Update billing or trial status to delete documents.",
    });

    expect(emitDomainEvent).not.toHaveBeenCalled();
    expect(emitAuditLog).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("falls back to direct soft-delete when the RPC is missing from the remote schema", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.soft_delete_document" },
    });

    await expect(deleteDocumentAction(DOCUMENT_ID)).resolves.toEqual({});

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      deleted_at: expect.any(String),
      updated_by: expect.any(String),
    }));
    expect(fallbackDocumentEq).toHaveBeenCalledWith("id", DOCUMENT_ID);
    expect(fallbackOrganizationEq).toHaveBeenCalledWith("organization_id", ORGANIZATION_ID);
    expect(fallbackIsDeletedAt).toHaveBeenCalledWith("deleted_at", null);
    expect(emitDomainEvent).not.toHaveBeenCalled();
    expect(emitAuditLog).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/documents");
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/documents/${DOCUMENT_ID}`);
  });
});
