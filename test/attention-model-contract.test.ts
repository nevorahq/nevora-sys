import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ACTION_SOURCE_TYPES } from "@/modules/action-center/types/action-item.types";
import { NOTIFICATION_CATEGORIES } from "@/modules/notifications/types";
import { PLANNER_ENTRY_TYPES } from "@/modules/planner/types/planner.types";

/**
 * Sprint 3 — attention-model contract coverage.
 *
 * `docs/contracts/attention-model.md` is the canonical semantics contract. Its
 * value is only as good as its completeness: a source type that exists in code
 * but is missing from the mapping table is exactly the silent gap that lets one
 * obligation slip into two queues (or into none). These assertions pin the doc
 * to the real enums, so adding a new source/category forces a contract update.
 */

const ROOT = process.cwd();
const doc = readFileSync(join(ROOT, "docs/contracts/attention-model.md"), "utf8");

describe("attention-model contract: mapping is complete", () => {
  it("covers every ActionSourceType", () => {
    expect(ACTION_SOURCE_TYPES.length).toBeGreaterThanOrEqual(8);
    for (const source of ACTION_SOURCE_TYPES) {
      expect(doc, `attention-model.md omits source "${source}"`).toContain(`**${source}**`);
    }
  });

  it("covers every NotificationCategory", () => {
    expect(NOTIFICATION_CATEGORIES.length).toBeGreaterThanOrEqual(5);
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(doc, `attention-model.md omits category "${category}"`).toContain(category);
    }
  });

  it("names every capture (PlannerEntry) type", () => {
    expect(PLANNER_ENTRY_TYPES.length).toBeGreaterThanOrEqual(6);
    for (const kind of PLANNER_ENTRY_TYPES) {
      expect(doc, `attention-model.md omits capture type "${kind}"`).toContain(`\`${kind}\``);
    }
  });
});

describe("attention-model contract: the hard invariants are stated", () => {
  it("states the four canonical states", () => {
    for (const state of ["Inbox", "Notification", "Action item", "Resolved"]) {
      expect(doc).toContain(state);
    }
  });

  it("states read != resolved and cites the proof test", () => {
    expect(doc).toContain("mark_all_visible_notifications_read");
    expect(doc).toContain("release-invariants.test.ts");
  });

  it("states the de-dup keys (one obligation, one queue)", () => {
    expect(doc).toContain("action_items_dedupe_idx");
    expect(doc).toContain("notifications_delivery_dedupe_idx");
    expect(doc).toContain("billing_period_key");
  });

  it("records the GAP-C navigation decision (Home = Action Center)", () => {
    expect(doc).toContain("GAP-C");
    expect(doc).toMatch(/Home\s*=\s*Action Center/);
  });
});
