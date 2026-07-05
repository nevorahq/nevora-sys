import "server-only";
import { getAnthropicClient, AI_MODELS } from "@/lib/ai";
import { logger } from "@/lib/observability/logger";
import { plannerIntentDetectionSchema } from "../schemas/planner-suggestion.schema";
import { normalizePlannerIntent } from "../utils/normalize-planner-intent";
import type { PlannerIntentDetectionResult } from "../types/planner.types";

/**
 * Detect the user's intent from a raw capture and propose reviewable actions.
 *
 * Contract: AI output NEVER creates a business entity here — it only produces
 * schema-validated *suggestions*. The user always confirms downstream.
 *
 * Safety / degradation:
 *   - No API key, model error, unparseable or schema-invalid output
 *     → fall back to the deterministic normalizer (money-safe types only).
 *   - The caller treats a thrown error as a failed entry; this function does not
 *     throw for the "AI unavailable" case, it degrades. It throws only if BOTH
 *     the AI path AND the fallback produced nothing usable (never, in practice).
 *
 * The prompt constrains the model to the allowed suggestion types and forbids any
 * money-transaction intent — mirroring the hard rule that financial capture may
 * only ever become a task / reminder / review item.
 */

const SYSTEM_PROMPT = `You are the intent router for a business "Capture Inbox".
The user drops a raw thought, obligation, reminder, or financial signal.
Return STRICT JSON (no markdown) with this shape:
{
  "detectedIntent": string,
  "confidence": number (0..1),
  "suggestions": [
    {
      "suggestionType": one of "create_task" | "create_financial_task" | "create_subscription_reminder" | "create_money_reminder" | "link_entities" | "create_action_item",
      "title": string,
      "description": string (optional),
      "proposedPayload": object,
      "confidence": number (0..1)
    }
  ],
  "missingInformation": string[] (optional)
}
Rules:
- Propose 1 suggestion in most cases; 2 only if clearly two distinct actions.
- Anything about a payment, invoice, bill, subscription, tax, or recurring charge
  MUST use a financial type (create_financial_task / create_money_reminder /
  create_subscription_reminder). NEVER propose posting a transaction or an expense —
  those types do not exist here. A financial suggestion only ever becomes a
  reminder/task the user pays manually later.
- For financial payloads use keys: title, financialDueDate (YYYY-MM-DD), amount
  (number, optional), currency (3-letter, optional), providerName (optional).
- For create_task payloads use keys: title, description, dueDate (YYYY-MM-DD, optional), priority (low|medium|high).
- If a required date/amount is unknown, omit it and add it to missingInformation.
- Never invent specific dates or amounts that are not implied by the input.`;

export async function detectPlannerIntent(
  rawText: string,
): Promise<PlannerIntentDetectionResult> {
  const text = rawText.trim();
  if (!text) return normalizePlannerIntent(text);

  if (!process.env.ANTHROPIC_API_KEY) {
    return normalizePlannerIntent(text);
  }

  try {
    const anthropic = getAnthropicClient();
    const message = await anthropic.messages.create({
      model: AI_MODELS.fast,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return normalizePlannerIntent(text);
    }

    const cleaned = textBlock.text.replace(/```json\n?|```\n?/g, "").trim();
    const parsedJson = JSON.parse(cleaned) as unknown;
    const validated = plannerIntentDetectionSchema.safeParse(parsedJson);
    if (!validated.success || validated.data.suggestions.length === 0) {
      logger.warn?.("[detectPlannerIntent] AI output invalid, using fallback");
      return normalizePlannerIntent(text);
    }

    return validated.data;
  } catch (error) {
    logger.warn?.("[detectPlannerIntent] AI call failed, using fallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    return normalizePlannerIntent(text);
  }
}
