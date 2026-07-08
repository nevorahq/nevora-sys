import { describe, expect, it } from "vitest";
import { computeActivationFunnel, type DraftDecisions, type FunnelRow, type SelectionSources } from "./activation-metrics";

const NO_DRAFTS: DraftDecisions = { accepted: 0, rejected: 0, expired: 0, pending: 0 };
const NO_SOURCES: SelectionSources = { wizard: 0, empty_state: 0 };

function row(overrides: Partial<FunnelRow> = {}): FunnelRow {
  return {
    started_at: "2026-07-08T10:00:00.000Z",
    selected_at: null,
    selected_first_action: null,
    first_action_completed_at: null,
    first_workflow_completed_at: null,
    dismissed_at: null,
    action_center_last_seen_at: null,
    ...overrides,
  };
}

/** A user who went all the way, in `seconds`. */
function activated(seconds: number, overrides: Partial<FunnelRow> = {}): FunnelRow {
  const started = Date.parse("2026-07-08T10:00:00.000Z");
  return row({
    selected_at: "2026-07-08T10:00:30.000Z",
    selected_first_action: "upload_document",
    first_action_completed_at: "2026-07-08T10:01:00.000Z",
    first_workflow_completed_at: new Date(started + seconds * 1000).toISOString(),
    ...overrides,
  });
}

describe("computeActivationFunnel — counts", () => {
  it("counts each funnel stage independently", () => {
    const funnel = computeActivationFunnel(
      [
        row(), // arrived, picked nothing
        row({ selected_at: "x", selected_first_action: "create_task" }),
        row({ selected_at: "x", selected_first_action: "create_task", first_action_completed_at: "y" }),
        activated(600),
        row({ dismissed_at: "z" }),
      ],
      NO_DRAFTS,
      NO_SOURCES,
    );

    expect(funnel.started).toBe(5);
    expect(funnel.selected).toBe(3);
    expect(funnel.firstActionCompleted).toBe(2);
    expect(funnel.activated).toBe(1);
    expect(funnel.dismissed).toBe(1);
  });

  it("attributes activation to the action the user picked", () => {
    const funnel = computeActivationFunnel(
      [
        activated(60, { selected_first_action: "upload_document" }),
        row({ selected_at: "x", selected_first_action: "upload_document" }),
        row({ selected_at: "x", selected_first_action: "add_subscription" }),
      ],
      NO_DRAFTS,
      NO_SOURCES,
    );

    expect(funnel.byFirstAction.upload_document).toEqual({ selected: 2, activated: 1 });
    expect(funnel.byFirstAction.add_subscription).toEqual({ selected: 1, activated: 0 });
    expect(funnel.byFirstAction.create_task).toEqual({ selected: 0, activated: 0 });
    expect(funnel.byFirstAction.capture_inbox_item).toEqual({ selected: 0, activated: 0 });
  });
});

describe("computeActivationFunnel — rates are undefined, not zero", () => {
  it("returns null for every rate on an empty cohort", () => {
    const funnel = computeActivationFunnel([], NO_DRAFTS, NO_SOURCES);

    // "0% confirmation" for a cohort that never saw a draft is a lie that gets acted on.
    expect(funnel.rates).toEqual({
      firstActionCompletion: null,
      activation: null,
      draftConfirmation: null,
      draftRejection: null,
      emptyStateCtaShare: null,
      returnedOnALaterDay: null,
    });
    expect(funnel.timeToActivationSeconds).toEqual({ p50: null, p90: null });
  });

  it("distinguishes a genuine zero from an absent denominator", () => {
    const funnel = computeActivationFunnel(
      [row({ selected_at: "x", selected_first_action: "create_task" })],
      { accepted: 0, rejected: 3, expired: 0, pending: 0 },
      NO_SOURCES,
    );

    expect(funnel.rates.draftConfirmation).toBe(0); // three drafts, none confirmed
    expect(funnel.rates.emptyStateCtaShare).toBeNull(); // nobody clicked anything
    expect(funnel.rates.firstActionCompletion).toBe(0); // one selection, no entity
  });

  it("ignores expired and pending drafts when computing confirmation", () => {
    const funnel = computeActivationFunnel([], { accepted: 3, rejected: 1, expired: 50, pending: 90 }, NO_SOURCES);

    // Only decided drafts belong in the denominator; a swept-away draft was never a choice.
    expect(funnel.rates.draftConfirmation).toBe(0.75);
    expect(funnel.rates.draftRejection).toBe(0.25);
  });

  it("computes the empty-state CTA share of all first-action clicks", () => {
    const funnel = computeActivationFunnel([], NO_DRAFTS, { wizard: 3, empty_state: 1 });
    expect(funnel.rates.emptyStateCtaShare).toBe(0.25);
  });
});

describe("computeActivationFunnel — time to activation", () => {
  it("uses the median, not the mean, so one abandoned tab cannot swamp the cohort", () => {
    const funnel = computeActivationFunnel(
      [activated(60), activated(120), activated(180), activated(86_400)],
      NO_DRAFTS,
      NO_SOURCES,
    );

    // Mean would be ~21_690s. The median says what a typical user experiences.
    expect(funnel.timeToActivationSeconds.p50).toBe(120);
    expect(funnel.timeToActivationSeconds.p90).toBe(86_400);
  });

  it("reports a single activation as both p50 and p90", () => {
    const funnel = computeActivationFunnel([activated(300)], NO_DRAFTS, NO_SOURCES);
    expect(funnel.timeToActivationSeconds).toEqual({ p50: 300, p90: 300 });
  });

  it("never reports a negative duration when the clocks disagree", () => {
    const funnel = computeActivationFunnel(
      [row({ started_at: "2026-07-08T10:00:05.000Z", first_workflow_completed_at: "2026-07-08T10:00:00.000Z" })],
      NO_DRAFTS,
      NO_SOURCES,
    );
    expect(funnel.timeToActivationSeconds.p50).toBe(0);
  });
});

describe("computeActivationFunnel — coming back", () => {
  it("counts only a strictly later day as a return", () => {
    const funnel = computeActivationFunnel(
      [
        // Same day: activation is DETECTED during an Action Center render, which
        // stamps last_seen_at. Counting this would report ~100% and mean nothing.
        activated(600, { action_center_last_seen_at: "2026-07-08T23:59:59.000Z" }),
        activated(600, { action_center_last_seen_at: "2026-07-09T00:00:01.000Z" }),
        activated(600, { action_center_last_seen_at: null }),
        activated(600, { action_center_last_seen_at: "2026-07-20T09:00:00.000Z" }),
      ],
      NO_DRAFTS,
      NO_SOURCES,
    );

    expect(funnel.rates.returnedOnALaterDay).toBe(0.5);
  });

  it("does not credit a return to a user who never activated", () => {
    const funnel = computeActivationFunnel(
      [row({ action_center_last_seen_at: "2026-09-01T00:00:00.000Z" })],
      NO_DRAFTS,
      NO_SOURCES,
    );

    expect(funnel.rates.returnedOnALaterDay).toBeNull(); // no activated users at all
  });
});
