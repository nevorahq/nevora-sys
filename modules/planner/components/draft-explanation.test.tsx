// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import { ru } from "@/shared/i18n/dictionaries/ru";
import { DraftExplanation } from "./draft-explanation";
import type { DraftExplanation as Explanation } from "../utils/explain-draft";

const dict = en.inbox.draft;

afterEach(cleanup);

function explanation(overrides: Partial<Explanation> = {}): Explanation {
  return {
    actionType: "create_task",
    origin: { kind: "manual_capture" },
    band: "ready",
    effects: [{ kind: "create", entityType: "task" }],
    moneySafe: false,
    unsupported: false,
    ...overrides,
  };
}

describe("DraftExplanation", () => {
  it("answers all four B3 questions for the canonical document → task draft", () => {
    render(
      <DraftExplanation
        dict={dict}
        explanation={explanation({
          origin: { kind: "source_entity", sourceType: "document", label: "lease-agreement.pdf" },
          effects: [
            { kind: "create", entityType: "task" },
            { kind: "link", fromType: "document", toType: "task" },
          ],
        })}
      />,
    );

    // 1. what is proposed / 3. what will change
    expect(screen.getByText(dict.prepared)).toBeDefined();
    expect(screen.getByText(dict.willCreateTask)).toBeDefined();

    // 2. why — names the source document by title
    expect(screen.getByText(/lease-agreement\.pdf/)).toBeDefined();

    // 4. what links will be created — both endpoints rendered
    expect(screen.getByText(dict.linksLabel)).toBeDefined();
    expect(screen.getByText(dict.entities.document)).toBeDefined();
    expect(screen.getByText(dict.entities.task)).toBeDefined();

    // And the standing promise that nothing has happened yet.
    expect(screen.getByText(dict.confirmHint)).toBeDefined();
  });

  it("states plainly that a financial draft posts no money", () => {
    render(
      <DraftExplanation
        dict={dict}
        explanation={explanation({
          actionType: "create_financial_task",
          effects: [{ kind: "create", entityType: "financial_task" }],
          moneySafe: true,
        })}
      />,
    );

    expect(screen.getByText(dict.moneySafe)).toBeDefined();
    expect(screen.getByText(dict.willCreateFinancialTask)).toBeDefined();
  });

  it("warns instead of promising when confirm would refuse the draft", () => {
    render(
      <DraftExplanation
        dict={dict}
        explanation={explanation({ actionType: "create_document", effects: [], unsupported: true })}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(dict.unsupported);
    // Promising "confirm to update related data" would be a lie here.
    expect(screen.queryByText(dict.confirmHint)).toBeNull();
    expect(screen.queryByText(dict.changesLabel)).toBeNull();
  });

  it("shows a pure relation draft as creating no new records", () => {
    render(
      <DraftExplanation
        dict={dict}
        explanation={explanation({
          actionType: "link_entities",
          effects: [{ kind: "link", fromType: "document", toType: "task" }, { kind: "no_new_data" }],
        })}
      />,
    );

    expect(screen.getByText(dict.noNewData)).toBeDefined();
    expect(screen.getByText(dict.linksLabel)).toBeDefined();
  });

  it("reports the AI intent for a typed capture", () => {
    render(
      <DraftExplanation dict={dict} explanation={explanation({ origin: { kind: "ai_detection", intent: "pay a bill" } })} />,
    );

    expect(screen.getByText(/pay a bill/)).toBeDefined();
  });

  it("renders an unmapped entity type rather than an empty chip", () => {
    render(
      <DraftExplanation
        dict={dict}
        explanation={explanation({ effects: [{ kind: "link", fromType: "invoice", toType: "task" }] })}
      />,
    );

    expect(screen.getByText("invoice")).toBeDefined();
  });

  it("renders the Russian dictionary with the same structure", () => {
    render(
      <DraftExplanation
        dict={ru.inbox.draft}
        explanation={explanation({
          origin: { kind: "source_entity", sourceType: "subscription", label: "Figma" },
          effects: [{ kind: "create", entityType: "task" }],
        })}
      />,
    );

    expect(screen.getByText(ru.inbox.draft.prepared)).toBeDefined();
    expect(screen.getByText(ru.inbox.draft.willCreateTask)).toBeDefined();
    expect(screen.getByText(/Figma/)).toBeDefined();
  });
});
