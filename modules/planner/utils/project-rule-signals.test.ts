import { describe, expect, it } from "vitest";
import {
  learnableSignal,
  preserveProjectProvenance,
  projectRuleLesson,
  readChannelSignals,
  signalCandidates,
  stampProjectProvenance,
} from "./project-rule-signals";
import type { PlannerIntentDetectionResult } from "../types/planner.types";

const ACME = "11111111-1111-4111-8111-111111111111";
const INTERNAL = "22222222-2222-4222-8222-222222222222";

const slack = { slack_channel: "T1:C1", slack_channel_label: "#acme" };
const email = { email_sender: "bob@acme.com", email_domain: "acme.com" };

function detection(payload: Record<string, unknown>): PlannerIntentDetectionResult {
  return {
    detectedIntent: "task",
    confidence: 0.9,
    suggestions: [
      { suggestionType: "create_task", title: "A", proposedPayload: payload, confidence: 0.9 },
      { suggestionType: "create_task", title: "B", proposedPayload: {}, confidence: 0.9 },
    ],
  };
}

describe("signals", () => {
  it("orders candidates most specific first and learns channel > domain > sender", () => {
    expect(signalCandidates(email).map((c) => c.type)).toEqual(["email_sender", "email_domain"]);
    expect(learnableSignal(slack)).toEqual({ type: "slack_channel", value: "T1:C1", label: "#acme" });
    expect(learnableSignal(email)).toEqual({ type: "email_domain", value: "acme.com", label: "@acme.com" });
    expect(learnableSignal({ email_sender: "bob@gmail.com" })?.type).toBe("email_sender");
    expect(learnableSignal({})).toBeNull();
  });

  it("reads stored signals defensively", () => {
    expect(readChannelSignals(null)).toEqual({});
    expect(readChannelSignals([])).toEqual({});
    expect(readChannelSignals({ email_sender: "Bob@Acme.com", email_domain: 5, junk: "x" })).toEqual({ email_sender: "bob@acme.com" });
  });
});

describe("stampProjectProvenance", () => {
  it("lets a matched rule decide every draft of the capture", () => {
    const stamped = stampProjectProvenance(detection({ projectId: INTERNAL }), { ruleId: "r1", projectId: ACME });
    for (const suggestion of stamped.suggestions) {
      expect(suggestion.proposedPayload).toMatchObject({
        projectId: ACME,
        suggestedProjectId: ACME,
        projectSource: "rule",
        projectRuleId: "r1",
      });
    }
  });

  it("records the AI's pick as the suggestion, and nothing when there is none", () => {
    const stamped = stampProjectProvenance(detection({ projectId: ACME }), null);
    expect(stamped.suggestions[0].proposedPayload).toEqual({ projectId: ACME, suggestedProjectId: ACME, projectSource: "ai" });
    expect(stamped.suggestions[1].proposedPayload).toEqual({});
  });

  it("drops provenance keys the model tried to supply", () => {
    const stamped = stampProjectProvenance(detection({ projectSource: "rule", projectRuleId: "forged" }), null);
    expect(stamped.suggestions[0].proposedPayload).toEqual({});
  });
});

describe("preserveProjectProvenance", () => {
  it("keeps Nevora's keys across an edit and ignores forged ones", () => {
    const current = { projectId: ACME, suggestedProjectId: ACME, projectSource: "ai" };
    expect(preserveProjectProvenance({ projectId: INTERNAL, suggestedProjectId: INTERNAL, projectSource: "rule", projectRuleId: "x" }, current)).toEqual({
      projectId: INTERNAL,
      suggestedProjectId: ACME,
      projectSource: "ai",
    });
  });
});

describe("projectRuleLesson", () => {
  const proposedByAi = { suggestedProjectId: ACME, projectSource: "ai" };
  const proposedByRule = { suggestedProjectId: ACME, projectSource: "rule", projectRuleId: "r1" };

  it("teaches nothing when the user kept the proposed project", () => {
    expect(projectRuleLesson(proposedByAi, slack, ACME)).toEqual({ kind: "none" });
    expect(projectRuleLesson({}, slack, null)).toEqual({ kind: "none" });
  });

  it("learns the source → project on a correction, including picking one where none was proposed", () => {
    expect(projectRuleLesson(proposedByAi, slack, INTERNAL)).toEqual({
      kind: "learn",
      signal: { type: "slack_channel", value: "T1:C1", label: "#acme" },
      projectId: INTERNAL,
    });
    expect(projectRuleLesson({}, email, ACME)).toMatchObject({ kind: "learn", signal: { type: "email_domain" } });
  });

  it("learns nothing from an in-app capture (no source)", () => {
    expect(projectRuleLesson(proposedByAi, {}, INTERNAL)).toEqual({ kind: "none" });
  });

  it("retires the rule when the user cleared the project it proposed, but not an AI guess", () => {
    expect(projectRuleLesson(proposedByRule, slack, null)).toEqual({ kind: "forget", ruleId: "r1" });
    expect(projectRuleLesson(proposedByAi, slack, null)).toEqual({ kind: "none" });
  });
});
