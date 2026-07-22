import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTIVATION_MILESTONES,
  FAILURE_EVENTS,
  MILESTONE_EVENT_NAMES,
  computeActivationMilestones,
  type MilestoneEvent,
} from "./activation-milestones";

/**
 * Sprint 6 — S6.2 activation milestones. The compute must be aggregate + distinct
 * per org, and every milestone must map to a REAL domain event name (a typo would
 * silently never fire).
 */

const ROOT = process.cwd();
const ev = (organization_id: string, event_name: string, aggregate_id?: string): MilestoneEvent =>
  ({ organization_id, event_name, aggregate_id });

describe("computeActivationMilestones", () => {
  const events: MilestoneEvent[] = [
    ev("org-1", "planner_entry.created"),
    ev("org-1", "planner_entry.created"), // duplicate — reach must still be 1 org
    ev("org-1", "planner_suggestion.accepted"),
    ev("org-1", "task.completed"),
    ev("org-1", "action_item.resolved"),
    ev("org-1", "action_item.resolved"), // 2 resolutions
    ev("org-1", "action_item.failed"),
    ev("org-2", "planner_entry.created"),
    ev("org-2", "financial_suggestion.confirmed"),
    ev("org-2", "financial_obligation.paid"),
    ev("org-2", "planner_entry.failed"),
    ev("org-2", "org.created"), // noise — not a milestone
  ];

  const result = computeActivationMilestones(events);

  it("counts distinct organizations per milestone", () => {
    expect(result.reach.first_capture).toBe(2); // org-1 (deduped) + org-2
    expect(result.reach.first_accepted_inbox).toBe(1);
    expect(result.reach.first_completed_task).toBe(1);
    expect(result.reach.first_confirmed_document).toBe(1);
    expect(result.reach.first_paid_subscription_cycle).toBe(1);
    expect(result.reach.action_center_resolution).toBe(1);
  });

  it("totals failures and resolutions", () => {
    expect(result.failureEvents).toBe(2); // action_item.failed + planner_entry.failed
    expect(result.resolutionEvents).toBe(2);
  });

  it("ignores non-milestone noise and empty input", () => {
    expect(computeActivationMilestones([]).reach.first_capture).toBe(0);
    expect(computeActivationMilestones([ev("o", "org.created")]).failureEvents).toBe(0);
  });

  it("correlates failure→recovery by aggregate_id", () => {
    const r = computeActivationMilestones([
      ev("org-1", "action_item.failed", "ai-1"),
      ev("org-1", "action_item.resolved", "ai-1"), // ai-1 recovered
      ev("org-1", "planner_entry.failed", "pe-2"), // pe-2 never recovered
      ev("org-2", "planner_suggestion.failed", "ps-3"),
      ev("org-2", "planner_suggestion.accepted", "ps-3"), // ps-3 recovered
    ]);
    expect(r.failedAggregates).toBe(3); // ai-1, pe-2, ps-3
    expect(r.recoveredFailures).toBe(2); // ai-1, ps-3
  });

  it("does not credit recovery on a different aggregate", () => {
    const r = computeActivationMilestones([
      ev("org-1", "action_item.failed", "ai-1"),
      ev("org-1", "action_item.resolved", "ai-OTHER"), // different aggregate
    ]);
    expect(r.failedAggregates).toBe(1);
    expect(r.recoveredFailures).toBe(0);
  });

  it("does not credit a recovery that happened before the failure", () => {
    const r = computeActivationMilestones([
      ev("org-1", "action_item.resolved", "ai-1"),
      ev("org-1", "action_item.failed", "ai-1"),
    ]);
    expect(r.failedAggregates).toBe(1);
    expect(r.recoveredFailures).toBe(0);
  });

  it("does not correlate equal aggregate ids across organizations", () => {
    const r = computeActivationMilestones([
      ev("org-1", "action_item.failed", "same-id"),
      ev("org-2", "action_item.resolved", "same-id"),
    ]);
    expect(r.failedAggregates).toBe(1);
    expect(r.recoveredFailures).toBe(0);
  });

  it("deduplicates repeated failures and resets recovery after a later failure", () => {
    const r = computeActivationMilestones([
      ev("org-1", "action_item.failed", "ai-1"),
      ev("org-1", "action_item.failed", "ai-1"),
      ev("org-1", "action_item.resolved", "ai-1"),
      ev("org-1", "action_item.failed", "ai-1"),
    ]);
    expect(r.failedAggregates).toBe(1);
    expect(r.recoveredFailures).toBe(0);
  });

  it("carries only aggregate numbers (no ids/content in the shape)", () => {
    expect(typeof result.failureEvents).toBe("number");
    expect(Object.values(result.reach).every((v) => typeof v === "number")).toBe(true);
  });
});

describe("milestone event names are real", () => {
  const names = readFileSync(join(ROOT, "lib/events/domain-event-names.ts"), "utf8");

  it.each(MILESTONE_EVENT_NAMES)("%s is a declared domain event", (name) => {
    expect(names, `${name} is not a known domain event — it would never fire`).toContain(`"${name}"`);
  });

  it("maps exactly the six S6.2 milestones + failure events", () => {
    expect(Object.keys(ACTIVATION_MILESTONES)).toHaveLength(6);
    expect(FAILURE_EVENTS.length).toBeGreaterThanOrEqual(3);
  });
});

describe("activation milestones: privacy + wiring", () => {
  const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

  it("the query reads domain_events cross-org via the service role", () => {
    const q = read("modules/onboarding/queries/get-activation-milestones.ts");
    expect(q).toContain('.from("domain_events")');
    expect(q).toContain("getServiceRoleClient");
    // aggregate-only: it selects org + name, never payload/content
    expect(q).toContain('.select("organization_id, event_name, aggregate_id")');
    expect(q).toContain('.order("created_at", { ascending: true })');
    expect(q).toContain('.range(offset, offset + PAGE_SIZE - 1)');
    expect(q).not.toMatch(/payload/);
  });

  it("the funnel endpoint includes milestones behind METRICS_SECRET", () => {
    const route = read("app/api/internal/activation-funnel/route.ts");
    expect(route).toContain("getActivationMilestones");
    expect(route).toContain("milestones");
    expect(route).toContain("METRICS_SECRET");
  });
});
