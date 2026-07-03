import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, AI_MODELS } from "@/lib/ai/anthropic-client";
import {
  aiCategorySuggestionSchema,
  type AiCategorySuggestion,
} from "../schemas/ai-category-suggestion.schema";

/**
 * AI categorization call for a single money transaction (Phase 5, spec §10).
 *
 * Sends ONLY the minimal transaction facts plus the org's selectable category
 * names — never user emails, auth ids, unrelated documents or credentials.
 * Output is forced through a tool call and Zod-validated before it is trusted.
 * Any provider/JSON failure returns { ok: false } so the caller can mark the
 * transaction 'failed' without breaking anything else.
 */

export interface AiCategorizationInput {
  title: string;
  note?: string | null;
  merchantName?: string | null;
  amount: number;
  currency: string;
  transactionDate: string;
  transactionType: "income" | "expense";
  /** Selectable categories of the SAME type, org-scoped. Names only. */
  availableCategories: string[];
}

export type AiCategorizationResult =
  | { ok: true; suggestion: AiCategorySuggestion; rawInput: Record<string, unknown>; rawOutput: unknown }
  | { ok: false; errorCode: "ai_call_failed" | "invalid_output"; errorMessage: string };

const TOOL_NAME = "suggest_transaction_category";

const SYSTEM_PROMPT = `You are a precise financial transaction categorization engine for a small-business finance tool.
Rules:
- Answer ONLY through the provided tool. Never write prose.
- category_name MUST be one of the provided available categories, verbatim. If nothing fits well, pick the closest one and lower the confidence.
- confidence is a calibrated 0..1 number: 0.9+ only when the merchant clearly implies the category.
- merchant_name: the cleaned merchant/brand name if you can infer one, otherwise null. Never invent one.
- tags: up to 5 short lowercase tags such as "subscription", "recurring", "one_off", "business_tool".
- reasoning: one or two short sentences a business owner can understand.`;

const TOOL_INPUT_SCHEMA = {
  type: "object",
  properties: {
    category_name: { type: "string" },
    type: { type: "string", enum: ["income", "expense"] },
    merchant_name: { type: ["string", "null"] },
    confidence: { type: "number" },
    tags: { type: "array", items: { type: "string" } },
    reasoning: { type: "string" },
  },
  required: ["category_name", "type", "merchant_name", "confidence", "reasoning"],
} as const;

export async function suggestCategoryWithAi(
  input: AiCategorizationInput,
): Promise<AiCategorizationResult> {
  // Compact prompt payload; also persisted as raw_input for calibration.
  const promptPayload: Record<string, unknown> = {
    title: input.title.slice(0, 200),
    note: input.note ? input.note.slice(0, 300) : null,
    merchant: input.merchantName ?? null,
    amount: input.amount,
    currency: input.currency,
    date: input.transactionDate,
    type: input.transactionType,
    available_categories: input.availableCategories.slice(0, 60),
  };

  let raw: unknown;
  try {
    const client = getAnthropicClient();
    const message = await client.messages.create({
      model: AI_MODELS.fast,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description: "Record the suggested category for the transaction.",
          input_schema: TOOL_INPUT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: `Categorize this transaction:\n${JSON.stringify(promptPayload)}`,
        },
      ],
    });

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      return { ok: false, errorCode: "ai_call_failed", errorMessage: "Model returned no structured output." };
    }
    raw = toolUse.input;
  } catch (err) {
    console.error("[suggestCategoryWithAi] model call failed:", err);
    return { ok: false, errorCode: "ai_call_failed", errorMessage: "The transaction could not be analyzed." };
  }

  const parsed = aiCategorySuggestionSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("[suggestCategoryWithAi] schema validation failed:", parsed.error.issues[0]?.message);
    return { ok: false, errorCode: "invalid_output", errorMessage: "AI output did not match the expected schema." };
  }

  return { ok: true, suggestion: parsed.data, rawInput: promptPayload, rawOutput: raw };
}
