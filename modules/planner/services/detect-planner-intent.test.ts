import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/ai", () => ({
  getAnthropicClient: () => ({ messages: { create } }),
  AI_MODELS: { fast: "test-model" },
}));

import { buildIntentSystemPrompt, detectPlannerIntent } from "./detect-planner-intent";

describe("detectPlannerIntent quota", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    create.mockReset();
  });
  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("does not call the model when the AI quota is exhausted, and still yields a task", async () => {
    const result = await detectPlannerIntent("Call the accountant", { reserveAiCall: async () => false });

    expect(create).not.toHaveBeenCalled();
    expect(result.suggestions[0].suggestionType).toBe("create_task");
  });

  it("returns no drafts for a document that asks for nothing, instead of guessing one", async () => {
    create.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ detectedIntent: "no_action", confidence: 0.8, suggestions: [] }) }],
    });

    const result = await detectPlannerIntent("Menu of the day: soup, salad", { source: "document" });

    expect(result.suggestions).toEqual([]);
  });

  it("does not guess a task from a document when the model is unavailable", async () => {
    create.mockRejectedValue(new Error("overloaded"));

    const result = await detectPlannerIntent("Sign the lease by Friday", { source: "document" });

    expect(result.suggestions).toEqual([]);
  });

  it("still guarantees a draft for a typed capture the model returned nothing for", async () => {
    create.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ detectedIntent: "x", confidence: 0.5, suggestions: [] }) }],
    });

    const result = await detectPlannerIntent("Call the accountant");

    expect(result.suggestions[0].suggestionType).toBe("create_task");
  });

  it("reserves exactly one call before using the model", async () => {
    const reserveAiCall = vi.fn(async () => true);
    create.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            detectedIntent: "call",
            confidence: 0.9,
            suggestions: [{ suggestionType: "create_task", title: "Call the accountant", proposedPayload: {}, confidence: 0.9 }],
          }),
        },
      ],
    });

    const result = await detectPlannerIntent("Call the accountant", { reserveAiCall });

    expect(reserveAiCall).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.detectedIntent).toBe("call");
  });
});

describe("buildIntentSystemPrompt", () => {
  it("lets a document yield several actions or none", () => {
    const prompt = buildIntentSystemPrompt(new Date("2026-09-28T10:00:00Z"), "document");
    expect(prompt).toContain("at most 5");
    expect(prompt).toContain("empty \"suggestions\" array");
  });

  it("anchors relative dates to today", () => {
    const prompt = buildIntentSystemPrompt(new Date("2026-09-28T10:00:00Z"));
    expect(prompt).toContain("Today is 2026-09-28 (Monday).");
  });

  it("offers no retired or non-task suggestion type", () => {
    const prompt = buildIntentSystemPrompt(new Date("2026-09-28T10:00:00Z"));
    for (const type of [
      "create_financial_task",
      "create_money_reminder",
      "create_subscription_reminder",
      "create_action_item",
      "link_entities",
    ]) {
      expect(prompt).not.toContain(type);
    }
  });
});
