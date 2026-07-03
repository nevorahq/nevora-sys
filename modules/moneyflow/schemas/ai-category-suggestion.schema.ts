import { z } from "zod";

/**
 * Structured output contract for AI transaction categorization.
 *
 * The model answers ONLY through a forced tool call (same pattern as
 * modules/ai/services/normalize-financial-document.ts). The raw tool input is
 * untrusted until it passes this schema — invalid JSON must never break the
 * transaction, so callers treat a parse failure as "AI failed", not an error
 * thrown to the user.
 */
export const aiCategorySuggestionSchema = z.object({
  category_name: z.string().trim().min(1).max(120),
  type: z.enum(["income", "expense"]),
  merchant_name: z.string().trim().max(240).nullable(),
  confidence: z.number().min(0).max(1),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  reasoning: z.string().trim().max(1000),
});

export type AiCategorySuggestion = z.infer<typeof aiCategorySuggestionSchema>;
