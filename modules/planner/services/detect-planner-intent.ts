import "server-only";
import { getAnthropicClient, AI_MODELS } from "@/lib/ai";
import { logger } from "@/lib/observability/logger";
import { plannerIntentDetectionSchema } from "../schemas/planner-suggestion.schema";
import { normalizePlannerIntent } from "../utils/normalize-planner-intent";
import { coerceDetection } from "../utils/coerce-detected-suggestion";
import { buildProjectPromptSection, resolveProjectRefs, type ProjectCandidate } from "../utils/project-classification";
import type { PlannerIntentDetectionResult } from "../types/planner.types";

/**
 * Detect the user's intent from a raw capture and propose reviewable actions.
 *
 * Contract: AI output NEVER creates a business entity here — it only produces
 * schema-validated *suggestions*. The user always confirms downstream.
 *
 * Safety / degradation:
 *   - No API key, model error, unparseable or schema-invalid output
 *     → fall back to the deterministic normalizer (task / action item only).
 *   - The caller treats a thrown error as a failed entry; this function does not
 *     throw for the "AI unavailable" case, it degrades. It throws only if BOTH
 *     the AI path AND the fallback produced nothing usable (never, in practice).
 *
 * The prompt offers only create_task, and any other type the model still returns
 * is coerced to a plain task (ADR 002, 0.1). An action item would land in the
 * read-only Action Center, which is not where a captured to-do belongs.
 * A payment thought becomes a task the user pays manually — never a money draft.
 */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The model has no clock: without today's date it resolves "Friday" or
 * "10 October" to a date in its training years. The date is UTC, so a capture
 * made near local midnight may resolve one day off — the user reviews it anyway.
 */
export type IntentSource = "capture" | "document";

const SOURCE_RULES: Record<IntentSource, string> = {
  capture: `The user drops a raw thought, obligation, reminder, or payment they must make.
Propose 1 suggestion in most cases; 2 only if clearly two distinct actions.`,
  document: `The input is text read from a photo or document the user captured: a
handwritten note, a whiteboard, a to-do list, a contract, a letter.
Propose one create_task per concrete action it asks of the user (at most 5),
e.g. a deadline to meet, something to sign, send, call about or prepare.
If it asks for no action, return an empty "suggestions" array.`,
};

export function buildIntentSystemPrompt(
  today: Date,
  source: IntentSource = "capture",
  projects: readonly ProjectCandidate[] = [],
): string {
  const iso = today.toISOString().slice(0, 10);
  return `You are the intent router for a business "Capture Inbox".
${SOURCE_RULES[source]}
Today is ${iso} (${WEEKDAYS[today.getUTCDay()]}).
Return STRICT JSON (no markdown) with this shape:
{
  "detectedIntent": string,
  "confidence": number (0..1),
  "suggestions": [
    {
      "suggestionType": "create_task",
      "title": string,
      "description": string (optional),
      "proposedPayload": object,
      "confidence": number (0..1)
    }
  ],
  "missingInformation": string[] (optional)
}
Rules:
- Every suggestion is a create_task: something the user has to do, including
  calling someone, sending something, or paying an invoice, bill, tax or
  subscription.
- For a payment, put the amount, currency and payee in the description
  (e.g. "Landlord · 500 EUR"). NEVER propose posting a transaction or an expense.
- Payload keys: title, description, dueDate (YYYY-MM-DD, optional), priority (low|medium|high).
- Resolve relative dates ("Friday", "tomorrow", "10 October") against today; a
  date without a year is its next occurrence on or after today.
- priority is "medium" unless the input signals urgency (urgent, asap, today,
  overdue, срочно) → "high", or explicitly says it can wait → "low".
- Write title and description in the language of the input.
- If a date is unknown, omit it and add it to missingInformation.
- Never invent specific dates or amounts that are not implied by the input.${buildProjectPromptSection(projects)}`;
}

export interface DetectPlannerIntentOptions {
  today?: Date;
  /**
   * `document`: the text was read from a captured file. Such text may ask for no
   * action at all, so an empty result is a valid answer, and without the model
   * there is no fallback guess — the caller routes the file to manual review.
   */
  source?: IntentSource;
  /**
   * Reserves one AI call against the organization's quota, right before the model
   * is called. `false` (quota exhausted) degrades to the fallback.
   */
  reserveAiCall?: () => Promise<boolean>;
  /**
   * The organization's live projects (ADR 002, 0.2b). The model may file each
   * draft under one; only ids from this list can come out. Without the model
   * (fallback) no project is proposed.
   */
  projects?: readonly ProjectCandidate[];
}

const NO_ACTION: PlannerIntentDetectionResult = { detectedIntent: "no_action", confidence: 0, suggestions: [] };

export async function detectPlannerIntent(
  rawText: string,
  { today = new Date(), source = "capture", reserveAiCall, projects = [] }: DetectPlannerIntentOptions = {},
): Promise<PlannerIntentDetectionResult> {
  const text = rawText.trim();
  const fallback = () => (source === "document" ? NO_ACTION : normalizePlannerIntent(text));
  if (!text) return fallback();

  if (!process.env.ANTHROPIC_API_KEY) {
    return fallback();
  }

  if (reserveAiCall && !(await reserveAiCall())) {
    return fallback();
  }

  try {
    const anthropic = getAnthropicClient();
    const message = await anthropic.messages.create({
      model: AI_MODELS.fast,
      max_tokens: 1024,
      system: buildIntentSystemPrompt(today, source, projects),
      messages: [{ role: "user", content: text }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return fallback();
    }

    const cleaned = textBlock.text.replace(/```json\n?|```\n?/g, "").trim();
    const parsedJson = JSON.parse(cleaned) as unknown;
    const validated = plannerIntentDetectionSchema.safeParse(parsedJson);
    if (!validated.success) {
      logger.warn?.("[detectPlannerIntent] AI output invalid, using fallback");
      return fallback();
    }
    // A document that asks for nothing is an answer; a typed capture is not.
    if (validated.data.suggestions.length === 0 && source === "capture") {
      return fallback();
    }

    return coerceDetection(resolveProjectRefs(validated.data, projects));
  } catch (error) {
    logger.warn?.("[detectPlannerIntent] AI call failed, using fallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback();
  }
}
