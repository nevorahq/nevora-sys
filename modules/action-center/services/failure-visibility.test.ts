import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { soundModeAllows } from "@/modules/notifications/preferences";

/**
 * Sprint 3 — unit 3.3: failure visibility.
 *
 * Every background failure must become a visible, recoverable state — never a
 * silent drop. These assertions pin the three legs of that guarantee:
 *   1. extraction failure → a `risk_detected` action item (generator wiring);
 *   2. snoozed items return to `open` at their scheduled time (migration 075);
 *   3. mandatory (high/critical) signals are not silenced by preferences.
 *
 * The self-clearing behaviour of the extraction item is covered behaviourally in
 * `reconcile-stale-action-items.test.ts`.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("failure visibility: extraction failure surfaces an action item", () => {
  const generator = read("modules/action-center/services/action-item-generator.ts");

  it("wires a failed-extraction detector into generation", () => {
    expect(generator).toContain("detectFailedExtractions(supabase, orgId, candidates)");
  });

  it("turns a failed extraction into a recoverable risk_detected item", () => {
    const fn = generator.slice(generator.indexOf("async function detectFailedExtractions"));
    expect(fn).toContain('.from("document_extractions")');
    expect(fn).toMatch(/status\s*!==\s*"failed"/); // only the latest-failed docs
    expect(fn).toContain('type: "risk_detected"');
    expect(fn).toContain('sourceType: "document"'); // routes to the document → Retry
  });
});

describe("failure visibility: snoozed returns at its time", () => {
  it("migration 075 reopens a snoozed item once snoozed_until has passed", () => {
    const sql = read("supabase/migrations/075_reminder_schedules_and_attention_counters.sql");
    expect(sql).toMatch(/status\s*=\s*'snoozed'\s+AND\s+.*snoozed_until\s*<=\s*now\(\)/i);
    expect(sql).toMatch(/UPDATE public\.action_items SET status = 'open', snoozed_until = NULL/i);
  });
});

describe("failure visibility: mandatory signals are not silenced", () => {
  // Durable in-app history is always kept (NOTIFICATION_POLICY.md); the sound
  // preference only gates AUDIO. An "important-only" preference must still let
  // high/critical (billing/security) through, and must not let low through.
  it("high/critical are audible under the important-only preference", () => {
    expect(soundModeAllows("important", "critical")).toBe(true);
    expect(soundModeAllows("important", "high")).toBe(true);
  });

  it("routine priorities are gated by the important-only preference", () => {
    expect(soundModeAllows("important", "low")).toBe(false);
    expect(soundModeAllows("important", "normal")).toBe(false);
  });

  it('"all" hears everything and "off" silences audio (never in-app history)', () => {
    expect(soundModeAllows("all", "low")).toBe(true);
    expect(soundModeAllows("off", "critical")).toBe(false);
  });
});
