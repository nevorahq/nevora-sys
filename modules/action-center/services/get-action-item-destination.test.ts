import { describe, expect, it } from "vitest";
import { getActionItemDestination, type ActionItemDestinationInput } from "./get-action-item-destination";

function item(overrides: Partial<ActionItemDestinationInput>): ActionItemDestinationInput {
  return {
    source_type: "system",
    type: "ai_suggestion",
    primary_entity_type: null,
    primary_entity_id: null,
    metadata: {},
    ...overrides,
  };
}

describe("getActionItemDestination", () => {
  it("routes a planner suggestion to the exact Inbox Review deep link", () => {
    const dest = getActionItemDestination(
      item({ source_type: "ai", primary_entity_type: "planner_suggestion", primary_entity_id: "sug-1", metadata: { source: "planner" } }),
    );
    expect(dest.target).toBe("inbox_review");
    expect(dest.href).toBe("/dashboard/inbox?tab=review&suggestion=sug-1");
  });

  it("routes a planner entry (no suggestion) to the Review tab", () => {
    const dest = getActionItemDestination(
      item({ source_type: "ai", primary_entity_type: "planner_entry", primary_entity_id: "entry-1", metadata: { source: "planner" } }),
    );
    expect(dest.target).toBe("inbox_review");
    expect(dest.href).toBe("/dashboard/inbox?tab=review");
  });

  it("treats a metadata-only planner signal as a planner capture", () => {
    const dest = getActionItemDestination(
      item({ source_type: "ai", primary_entity_type: null, metadata: { planner_entry_id: "e9" } }),
    );
    expect(dest.target).toBe("inbox_review");
  });

  it("routes a task to Tasks", () => {
    const dest = getActionItemDestination(item({ source_type: "task", primary_entity_type: "task", primary_entity_id: "t-1" }));
    expect(dest).toEqual({ href: "/dashboard/tasks/t-1", target: "tasks" });
  });

  it("routes a transaction to Money", () => {
    const dest = getActionItemDestination(item({ source_type: "transaction", primary_entity_type: "transaction", primary_entity_id: "tx-1" }));
    expect(dest).toEqual({ href: "/dashboard/money/tx-1", target: "money" });
  });

  it("routes a subscription to Subscriptions", () => {
    const dest = getActionItemDestination(item({ source_type: "subscription", primary_entity_type: "subscription", primary_entity_id: "s-1" }));
    expect(dest).toEqual({ href: "/dashboard/subscriptions/s-1", target: "subscriptions" });
  });

  it("routes a document to Documents", () => {
    const dest = getActionItemDestination(item({ source_type: "document", primary_entity_type: "document", primary_entity_id: "d-1" }));
    expect(dest).toEqual({ href: "/dashboard/documents/d-1", target: "documents" });
  });

  it("falls back to a document pointer carried in metadata", () => {
    const dest = getActionItemDestination(
      item({ source_type: "document", type: "draft_review", primary_entity_type: null, primary_entity_id: null, metadata: { source_document_id: "doc-9" } }),
    );
    expect(dest).toEqual({ href: "/dashboard/documents/doc-9", target: "documents" });
  });

  it("returns no link for a deleted source", () => {
    const dest = getActionItemDestination(item({ source_type: "task", primary_entity_type: "task", primary_entity_id: "t-1", metadata: { task_deleted: true } }));
    expect(dest).toEqual({ href: null, target: "none" });
  });

  it("returns no link for an unknown source type", () => {
    const dest = getActionItemDestination(item({ source_type: "crm", primary_entity_type: "deal", primary_entity_id: "deal-1" }));
    expect(dest).toEqual({ href: null, target: "none" });
  });

  it("returns no link when the entity id is missing", () => {
    const dest = getActionItemDestination(item({ source_type: "task", primary_entity_type: "task", primary_entity_id: null }));
    expect(dest).toEqual({ href: null, target: "none" });
  });
});
