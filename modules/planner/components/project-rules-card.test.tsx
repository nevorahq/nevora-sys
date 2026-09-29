// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";

const deleteMock = vi.fn(async (..._args: unknown[]) => ({ ok: true }));
const refresh = vi.fn();
vi.mock("../actions/delete-project-rule.action", () => ({ deleteProjectRuleAction: (...args: unknown[]) => deleteMock(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { ProjectRulesCard } = await import("./project-rules-card");
const t = en.channels.projectRules;

afterEach(() => {
  cleanup();
  deleteMock.mockClear();
  refresh.mockClear();
});

describe("ProjectRulesCard", () => {
  it("explains how rules appear when there are none", () => {
    render(<ProjectRulesCard t={t} rules={[]} />);
    expect(screen.getByText(t.empty)).toBeDefined();
  });

  it("lists source → project and deletes a rule", async () => {
    render(
      <ProjectRulesCard
        t={t}
        rules={[
          { id: "r1", signalType: "slack_channel", sourceLabel: "#acme-support", projectName: "Acme", hits: 4 },
          { id: "r2", signalType: "email_domain", sourceLabel: "@acme.com", projectName: null, hits: 0 },
        ]}
      />,
    );
    expect(screen.getByText("#acme-support")).toBeDefined();
    expect(screen.getByText("Acme")).toBeDefined();
    expect(screen.getByText(t.uses.replace("{count}", "4"))).toBeDefined();
    expect(screen.getByText(t.unknownProject)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: `${t.delete}: #acme-support` }));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("reports a failed delete", async () => {
    deleteMock.mockResolvedValueOnce({ ok: false });
    render(<ProjectRulesCard t={t} rules={[{ id: "r1", signalType: "email_sender", sourceLabel: "bob@acme.com", projectName: "Acme", hits: 1 }]} />);
    fireEvent.click(screen.getByRole("button", { name: `${t.delete}: bob@acme.com` }));
    expect(await screen.findByRole("alert")).toBeDefined();
  });
});
