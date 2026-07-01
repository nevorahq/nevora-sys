import { describe, it, expect } from "vitest";
import { RELATION_ENTITY_KINDS, MANUAL_RELATION_TYPES } from "../constants/relation.constants";
import { getRelationTypeOptionsForPair } from "./relation-type-options";

describe("getRelationTypeOptionsForPair", () => {
  it("returns semantic options for task ↔ document", () => {
    expect(getRelationTypeOptionsForPair("task", "document")).toEqual(
      expect.arrayContaining(["related_to", "documented_by", "attached_to"]),
    );
    expect(getRelationTypeOptionsForPair("document", "task")).toEqual(
      getRelationTypeOptionsForPair("task", "document"),
    );
  });

  it("returns semantic options for subscription ↔ document", () => {
    const options = getRelationTypeOptionsForPair("subscription", "document");
    expect(options).toEqual(
      expect.arrayContaining(["related_to", "contract_for_subscription", "documented_by", "attached_to"]),
    );
  });

  it("returns semantic options for transaction ↔ document", () => {
    const options = getRelationTypeOptionsForPair("transaction", "document");
    expect(options).toEqual(
      expect.arrayContaining(["related_to", "invoice_for_transaction", "documented_by", "attached_to"]),
    );
  });

  it("returns semantic options for task ↔ subscription", () => {
    const options = getRelationTypeOptionsForPair("task", "subscription");
    expect(options).toEqual(
      expect.arrayContaining(["related_to", "renewal_task", "requires_action_task", "belongs_to_subscription"]),
    );
  });

  it("returns semantic options for task ↔ transaction", () => {
    expect(getRelationTypeOptionsForPair("task", "transaction")).toEqual(
      expect.arrayContaining(["related_to", "requires_action_task"]),
    );
  });

  it("returns semantic options for subscription ↔ transaction", () => {
    expect(getRelationTypeOptionsForPair("subscription", "transaction")).toEqual(
      expect.arrayContaining(["related_to", "paid_by", "belongs_to_subscription"]),
    );
  });

  it("restricts same-type pairs to generic related_to only", () => {
    expect(getRelationTypeOptionsForPair("task", "task")).toEqual(["related_to"]);
    expect(getRelationTypeOptionsForPair("document", "document")).toEqual(["related_to"]);
    expect(getRelationTypeOptionsForPair("transaction", "transaction")).toEqual(["related_to"]);
    expect(getRelationTypeOptionsForPair("subscription", "subscription")).toEqual(["related_to"]);
  });

  it("never surfaces subscription/document-specific types for task ↔ task", () => {
    const options = getRelationTypeOptionsForPair("task", "task");
    expect(options).not.toContain("contract_for_subscription");
    expect(options).not.toContain("invoice_for_transaction");
    expect(options).not.toContain("renewal_task");
  });

  it("fails closed for unknown or paused CRM entity kinds", () => {
    expect(getRelationTypeOptionsForPair("client", "document")).toEqual([]);
    expect(getRelationTypeOptionsForPair("task", "deal")).toEqual([]);
    expect(getRelationTypeOptionsForPair("lead", "contact")).toEqual([]);
    expect(getRelationTypeOptionsForPair("", "task")).toEqual([]);
  });

  it("every returned option belongs to the manual vocabulary (no ad-hoc types)", () => {
    for (const a of RELATION_ENTITY_KINDS) {
      for (const b of RELATION_ENTITY_KINDS) {
        for (const option of getRelationTypeOptionsForPair(a, b)) {
          expect(MANUAL_RELATION_TYPES).toContain(option);
        }
      }
    }
  });

  it("covers every active-module pair with at least the generic related_to option", () => {
    for (const a of RELATION_ENTITY_KINDS) {
      for (const b of RELATION_ENTITY_KINDS) {
        const options = getRelationTypeOptionsForPair(a, b);
        expect(options.length).toBeGreaterThan(0);
        expect(options).toContain("related_to");
      }
    }
  });
});
