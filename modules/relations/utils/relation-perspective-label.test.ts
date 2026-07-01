import { describe, it, expect } from "vitest";
import { RELATION_TYPE_LABELS } from "../constants/relation.constants";
import { getRelationTypeLabel } from "./relation-perspective-label";

describe("getRelationTypeLabel", () => {
  it("renders contract_for_subscription from both perspectives", () => {
    // Subscription detail page: card shows the linked Document.
    expect(getRelationTypeLabel("contract_for_subscription", "document")).toBe("Contract");
    // Document detail page: card shows the linked Subscription.
    expect(getRelationTypeLabel("contract_for_subscription", "subscription")).toBe("Contract for");
  });

  it("renders invoice_for_transaction from both perspectives", () => {
    expect(getRelationTypeLabel("invoice_for_transaction", "document")).toBe("Invoice");
    expect(getRelationTypeLabel("invoice_for_transaction", "transaction")).toBe("Invoice for");
  });

  it("renders paid_by from both perspectives", () => {
    expect(getRelationTypeLabel("paid_by", "transaction")).toBe("Paid by");
    expect(getRelationTypeLabel("paid_by", "subscription")).toBe("Payment for");
  });

  it("renders belongs_to_subscription from both perspectives", () => {
    expect(getRelationTypeLabel("belongs_to_subscription", "subscription")).toBe("Belongs to");
    expect(getRelationTypeLabel("belongs_to_subscription", "task")).toBe("Includes");
    expect(getRelationTypeLabel("belongs_to_subscription", "transaction")).toBe("Includes");
  });

  it("renders documented_by from both perspectives", () => {
    expect(getRelationTypeLabel("documented_by", "document")).toBe("Documented by");
    expect(getRelationTypeLabel("documented_by", "task")).toBe("Documents");
    expect(getRelationTypeLabel("documented_by", "subscription")).toBe("Documents");
  });

  it("renders renewal_task from both perspectives", () => {
    expect(getRelationTypeLabel("renewal_task", "task")).toBe("Renewal task");
    expect(getRelationTypeLabel("renewal_task", "subscription")).toBe("Renewal for");
  });

  it("renders requires_action_task from both perspectives", () => {
    expect(getRelationTypeLabel("requires_action_task", "task")).toBe("Requires action");
    expect(getRelationTypeLabel("requires_action_task", "subscription")).toBe("Needs follow-up");
  });

  it("falls back to the generic label for symmetric types (no perspective override)", () => {
    expect(getRelationTypeLabel("related_to", "task")).toBe(RELATION_TYPE_LABELS.related_to);
    expect(getRelationTypeLabel("related_to", "document")).toBe(RELATION_TYPE_LABELS.related_to);
    expect(getRelationTypeLabel("attached_to", "subscription")).toBe(RELATION_TYPE_LABELS.attached_to);
  });

  it("falls back to the generic label for legacy (040) types", () => {
    expect(getRelationTypeLabel("related", "task")).toBe(RELATION_TYPE_LABELS.related);
    expect(getRelationTypeLabel("generated_from", "document")).toBe(RELATION_TYPE_LABELS.generated_from);
  });
});
