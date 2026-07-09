// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionFeedItem, ActionFeed as ActionFeedData } from "../types/action-center.types";
import type { ActionItemType } from "../types/action-item.types";
import { PHASE_B_SECTION_LABELS } from "../constants/action-center.constants";
import { en } from "@/shared/i18n/dictionaries/en";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/modules/billing/components/access-state", () => ({
  useAccessGate: () => ({ blocked: false, message: "" }),
  RestrictedActionTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/modules/notifications/components/notification-provider", () => ({
  useNotificationIndicator: () => ({ refreshCounters: vi.fn() }),
}));
vi.mock("../actions/get-feed.action", () => ({ getActionFeed: vi.fn() }));
vi.mock("../actions/bulk-dismiss-action-items", () => ({ bulkDismissActionItems: vi.fn() }));
vi.mock("../actions/restore-action-item", () => ({ restoreActionItem: vi.fn() }));
vi.mock("./action-detail-drawer", () => ({ ActionDetailDrawer: () => null }));
vi.mock("./action-filters", () => ({ ActionFilters: () => null }));
// Pulls in a Server Action, which drags in the env-validated Supabase client.
vi.mock("@/modules/onboarding/components/first-action-cta", () => ({
  FirstActionCta: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

const { ActionFeed } = await import("./action-feed");

afterEach(cleanup);

function item(id: string, type: ActionItemType, overrides: Partial<ActionFeedItem> = {}): ActionFeedItem {
  return {
    id,
    organization_id: "org-1",
    workspace_id: null,
    title: id,
    description: null,
    type,
    status: "open",
    priority: "medium",
    priority_score: 50,
    source_type: "system",
    source_id: "src",
    source_event_id: null,
    primary_entity_type: null,
    primary_entity_id: null,
    due_at: null,
    snoozed_until: null,
    resolved_at: null,
    dismissed_at: null,
    assigned_to: null,
    created_by: null,
    ai_generated: false,
    ai_confidence: null,
    ai_reason: null,
    metadata: {},
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    assignee_name: null,
    related_count: 0,
    ...overrides,
  } as ActionFeedItem;
}

function feed(partial: Partial<ActionFeedData["sections"]> = {}): ActionFeedData {
  return {
    sections: {
      due_soon: [],
      waiting_for_action: [],
      missing_information: [],
      ai_suggestions: [],
      recently_resolved: [],
      ...partial,
    },
    nextCursor: null,
  };
}

const props = {
  members: [],
  currentUserId: "user-1",
  firstRunDict: en.firstRun,
  showFirstActions: true,
  noMatchesLabel: en.common.noMatches,
};

describe("ActionFeed — Phase B sections", () => {
  it("renders the daily-screen headings including Money attention, not the raw taxonomy", () => {
    render(
      <ActionFeed
        initialFeed={feed({
          ai_suggestions: [item("draft", "ai_suggestion")],
          due_soon: [
            item("payment", "payment_required"), // money-by-type → Money attention
            item("task", "due_soon"), // plain work (source system) → Next actions
          ],
          recently_resolved: [item("done", "due_soon", { status: "resolved" })],
        })}
        {...props}
      />,
    );

    expect(screen.getByText(PHASE_B_SECTION_LABELS.needs_your_review)).toBeDefined();
    expect(screen.getByText(PHASE_B_SECTION_LABELS.money_attention)).toBeDefined();
    expect(screen.getByText(PHASE_B_SECTION_LABELS.next_actions)).toBeDefined();
    expect(screen.getByText(PHASE_B_SECTION_LABELS.recently_updated)).toBeDefined();

    // The old headings must be gone.
    expect(screen.queryByText("AI Suggestions")).toBeNull();
    expect(screen.queryByText("Waiting For Action")).toBeNull();
  });

  it("shows Recently updated even when nothing is active — the closed loop is the proof", () => {
    render(<ActionFeed initialFeed={feed({ recently_resolved: [item("done", "due_soon", { status: "resolved" })] })} {...props} />);

    expect(screen.getByText(PHASE_B_SECTION_LABELS.recently_updated)).toBeDefined();
    expect(screen.getByText("done")).toBeDefined();
    // No active work, so no active headings.
    expect(screen.queryByText(PHASE_B_SECTION_LABELS.needs_your_review)).toBeNull();
    expect(screen.queryByText(PHASE_B_SECTION_LABELS.next_actions)).toBeNull();
  });

  it("does not offer bulk-select over resolved history", () => {
    render(<ActionFeed initialFeed={feed({ recently_resolved: [item("done", "due_soon", { status: "resolved" })] })} {...props} />);

    // The select-all bar only appears when there is selectable active work.
    expect(screen.queryByLabelText("Select all active actions")).toBeNull();
  });

  it("offers Restore on a resolved card", () => {
    render(<ActionFeed initialFeed={feed({ recently_resolved: [item("done", "due_soon", { status: "resolved" })] })} {...props} />);

    expect(screen.getByText("Restore")).toBeDefined();
  });

  it("turns an empty feed into an activation prompt instead of a blank screen", () => {
    render(<ActionFeed initialFeed={feed()} {...props} />);

    // Before Phase B an empty feed rendered literally nothing.
    expect(screen.getByText(en.firstRun.empty.actionsTitle)).toBeDefined();
    expect(screen.getByText(en.firstRun.uploadDocument)).toBeDefined();
    expect(screen.getByText(en.firstRun.captureInboxItem)).toBeDefined();
  });

  it("does not duplicate the first actions while the wizard is on screen", () => {
    render(<ActionFeed initialFeed={feed()} {...props} showFirstActions={false} />);

    expect(screen.getByText(en.firstRun.empty.actionsTitle)).toBeDefined();
    expect(screen.queryByText(en.firstRun.uploadDocument)).toBeNull();
  });

  it("orders a draft above a higher-scoring capture inside Needs your review", () => {
    render(
      <ActionFeed
        initialFeed={feed({
          missing_information: [item("capture", "missing_information", { priority_score: 99 })],
          ai_suggestions: [item("draft", "ai_suggestion", { priority_score: 1 })],
        })}
        {...props}
      />,
    );

    const rendered = screen.getAllByText(/^(draft|capture)$/).map((n) => n.textContent);
    expect(rendered).toEqual(["draft", "capture"]);
  });
});
