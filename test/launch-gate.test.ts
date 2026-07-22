import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTIVATION_MILESTONES } from "@/modules/onboarding/services/activation-milestones";

/**
 * Sprint 6 — S6.3: the launch gate must stay wired to the real safety evidence
 * and the real activation milestones. Drift here is a launch decided against a
 * checklist that no longer matches the tests it claims to rely on.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const gate = read("docs/release/launch-gate-checklist.md");

/** The four key workflows the beta measures, by their milestone event. */
const KEY_WORKFLOW_EVENTS = [
  ACTIVATION_MILESTONES.first_accepted_inbox,
  ACTIVATION_MILESTONES.first_completed_task,
  ACTIVATION_MILESTONES.first_confirmed_document,
  ACTIVATION_MILESTONES.first_paid_subscription_cycle,
];

describe("launch gate: safety evidence is wired", () => {
  it.each([
    "test/release-invariants.test.ts",
    "test/financial-state-contract.test.ts",
    "test/ai-governance.test.ts",
    "test/analytics-privacy.test.ts",
    "shared/config/paused-modules.coverage.test.ts",
    "job-reliability-register.md",
    "p0-p1-issue-register.md",
    "rollback",
  ])("references %s", (token) => {
    expect(gate).toContain(token);
  });

  it("keeps the three decision outcomes", () => {
    expect(gate).toMatch(/Launch/);
    expect(gate).toMatch(/Limited beta extension/);
    expect(gate).toMatch(/No launch/);
  });
});

describe("launch gate: activation milestones stay in sync", () => {
  it.each(KEY_WORKFLOW_EVENTS)("lists the key-workflow milestone %s", (event) => {
    expect(gate, `launch gate omits milestone ${event}`).toContain(event);
  });
});

describe("launch artifacts: templates exist with the required fields", () => {
  it("the beta report template exists and captures env + cohort + workflow rates + decision", () => {
    const t = read("docs/release/beta-report-TEMPLATE.md");
    expect(t).toMatch(/Environment/i);
    expect(t).toMatch(/Cohort/i);
    for (const event of KEY_WORKFLOW_EVENTS) expect(t).toContain(event);
    expect(t).toMatch(/Launch|No launch/);
  });

  it("the launch decision record template exists and records owner + gate result", () => {
    expect(existsSync(join(ROOT, "docs/release/launch-decision-record-TEMPLATE.md"))).toBe(true);
    const t = read("docs/release/launch-decision-record-TEMPLATE.md");
    expect(t).toMatch(/Decision owner/i);
    expect(t).toMatch(/Safety gate/i);
    expect(t).toMatch(/No open P0\/P1/i);
  });
});
