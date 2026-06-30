import { describe, it, expect } from "vitest";
import {
  RELATION_ENTITY_KINDS,
  RELATION_ENTITY_CONFIG,
  ENTITY_KIND_TABLE,
  ENTITY_KIND_ROUTE,
  ENTITY_KIND_LABELS,
  ENTITY_KIND_SINGULAR,
  isEntityKind,
} from "./relation.constants";

const ID = "11111111-1111-4111-8111-111111111111";

// Paused CRM scope — must never be a supported relation entity kind.
const PAUSED_KINDS = ["client", "deal", "lead", "contact", "pipeline", "crm", "crm_clients", "crm_deals"];

describe("RELATION_ENTITY_CONFIG (single source of truth)", () => {
  it("covers exactly the four active modules and nothing else", () => {
    expect(Object.keys(RELATION_ENTITY_CONFIG).sort()).toEqual(
      ["document", "subscription", "task", "transaction"].sort(),
    );
    expect([...RELATION_ENTITY_KINDS].sort()).toEqual(Object.keys(RELATION_ENTITY_CONFIG).sort());
  });

  it("rejects paused CRM entity kinds", () => {
    for (const kind of PAUSED_KINDS) {
      expect(isEntityKind(kind)).toBe(false);
      expect(RELATION_ENTITY_CONFIG).not.toHaveProperty(kind);
    }
  });

  it("resolves table / label / route for each active kind", () => {
    expect(RELATION_ENTITY_CONFIG.document).toMatchObject({
      table: "documents",
      label: "Document",
      pluralLabel: "Documents",
      route: "/dashboard/documents",
    });
    expect(RELATION_ENTITY_CONFIG.subscription).toMatchObject({
      table: "subscriptions",
      label: "Subscription",
      pluralLabel: "Subscriptions",
      route: "/dashboard/subscriptions",
    });
    expect(RELATION_ENTITY_CONFIG.task).toMatchObject({
      table: "todos",
      label: "Task",
      pluralLabel: "Tasks",
      route: "/dashboard/tasks",
    });
    expect(RELATION_ENTITY_CONFIG.transaction).toMatchObject({
      table: "money_transactions",
      label: "Transaction",
      pluralLabel: "Money",
      route: "/dashboard/money",
    });
  });

  it("derives every public map from the config (no competing source)", () => {
    for (const kind of RELATION_ENTITY_KINDS) {
      const meta = RELATION_ENTITY_CONFIG[kind];
      expect(ENTITY_KIND_TABLE[kind]).toBe(meta.table);
      expect(ENTITY_KIND_LABELS[kind]).toBe(meta.pluralLabel);
      expect(ENTITY_KIND_SINGULAR[kind]).toBe(meta.label);
      expect(ENTITY_KIND_ROUTE[kind](ID)).toBe(`${meta.route}/${ID}`);
    }
  });

  it("generates detail hrefs from centralized routes", () => {
    expect(ENTITY_KIND_ROUTE.document(ID)).toBe(`/dashboard/documents/${ID}`);
    expect(ENTITY_KIND_ROUTE.subscription(ID)).toBe(`/dashboard/subscriptions/${ID}`);
    expect(ENTITY_KIND_ROUTE.task(ID)).toBe(`/dashboard/tasks/${ID}`);
    expect(ENTITY_KIND_ROUTE.transaction(ID)).toBe(`/dashboard/money/${ID}`);
  });
});
