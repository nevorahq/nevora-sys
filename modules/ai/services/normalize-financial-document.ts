import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, AI_MODELS } from "@/lib/ai/anthropic-client";
import {
  ExtractedFinancialDocumentSchema,
  type ExtractedFinancialDocument,
} from "@/modules/documents/schemas/extracted-financial-document.schema";
import { isExtractionMockEnabled, mockNormalizeFinancialDocument } from "./mock-financial-document";

/**
 * AI normalization (spec §22). Turns extracted text OR a document image/PDF
 * into the strict ExtractedFinancialDocument shape using Anthropic tool-use
 * (forced JSON). The output is Zod-validated by the caller's schema before it
 * is trusted.
 *
 * Only the user's own document content is ever sent — no cross-tenant data.
 */

export type NormalizationInput =
  | { kind: "text"; text: string }
  | { kind: "image"; base64: string; mediaType: string }
  | { kind: "pdf"; base64: string };

export type NormalizationResult =
  | { ok: true; extracted: ExtractedFinancialDocument; raw: unknown }
  | { ok: false; errorCode: "ai_normalization_failed" | "schema_validation_failed"; errorMessage: string };

const SYSTEM_PROMPT = `You are a precise financial-document extraction engine.
Extract structured data from the provided receipt, invoice, or payment confirmation.
Rules:
- Return data ONLY through the provided tool. Do not write prose.
- Never invent values. If a value is not present in the document, use null.
- Use ISO 8601 (YYYY-MM-DD) for dates when a date is found.
- Use an ISO 4217 currency code (e.g. EUR, USD, MDL). Default to EUR only if no currency is shown.
- Amounts are plain numbers (no currency symbols, dot as decimal separator).
- Detect the document type (receipt | invoice | payment_confirmation | unknown).
- Provide a calibrated confidence (0..1) per field group AND an overall confidence.
- Suggest a transaction category per line item when obvious.
- If the document looks like a recurring software/SaaS subscription payment, add a
  suggestedAction of type "link_subscription".`;

const TOOL_INPUT_SCHEMA = {
  type: "object",
  properties: {
    documentType: { type: "string", enum: ["receipt", "invoice", "payment_confirmation", "unknown"] },
    merchant: {
      type: "object",
      properties: {
        name: { type: ["string", "null"] },
        taxId: { type: ["string", "null"] },
        address: { type: ["string", "null"] },
      },
      required: ["name", "taxId", "address"],
    },
    transaction: {
      type: "object",
      properties: {
        date: { type: ["string", "null"] },
        currency: { type: "string" },
        subtotal: { type: ["number", "null"] },
        tax: { type: ["number", "null"] },
        total: { type: ["number", "null"] },
        paymentMethod: { type: ["string", "null"] },
        documentNumber: { type: ["string", "null"] },
      },
      required: ["date", "currency", "subtotal", "tax", "total", "paymentMethod"],
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: ["number", "null"] },
          unitPrice: { type: ["number", "null"] },
          totalPrice: { type: ["number", "null"] },
          taxRate: { type: ["number", "null"] },
          category: { type: ["string", "null"] },
        },
        required: ["name"],
      },
    },
    confidence: {
      type: "object",
      properties: {
        overall: { type: "number" },
        merchant: { type: "number" },
        date: { type: "number" },
        total: { type: "number" },
        items: { type: "number" },
      },
      required: ["overall", "merchant", "date", "total", "items"],
    },
    suggestedActions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["create_transaction", "link_subscription", "create_task", "request_review"] },
          reason: { type: "string" },
        },
        required: ["type", "reason"],
      },
    },
  },
  required: ["documentType", "merchant", "transaction", "confidence"],
} as const;

const TOOL_NAME = "record_financial_document";

function buildUserContent(input: NormalizationInput): Anthropic.MessageParam["content"] {
  const instruction = { type: "text" as const, text: "Extract the financial data from this document." };

  if (input.kind === "text") {
    return [
      { type: "text", text: "Document text (from PDF/OCR):\n\n" + input.text.slice(0, 50_000) },
      instruction,
    ];
  }
  if (input.kind === "image") {
    return [
      {
        type: "image",
        source: { type: "base64", media_type: input.mediaType as "image/png", data: input.base64 },
      },
      instruction,
    ];
  }
  // pdf
  return [
    {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: input.base64 },
    },
    instruction,
  ];
}

export async function normalizeFinancialDocument(
  input: NormalizationInput,
): Promise<NormalizationResult> {
  // Pseudo-provider for local testing without Anthropic credits. Server-env
  // flag only; never reachable from client input or on by default.
  if (isExtractionMockEnabled()) {
    return mockNormalizeFinancialDocument(input);
  }

  let raw: unknown;
  try {
    const client = getAnthropicClient();
    const message = await client.messages.create({
      model: AI_MODELS.default,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description: "Record the structured financial data extracted from the document.",
          input_schema: TOOL_INPUT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: buildUserContent(input) }],
    });

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      return { ok: false, errorCode: "ai_normalization_failed", errorMessage: "Model returned no structured output." };
    }
    raw = toolUse.input;
  } catch (err) {
    console.error("[normalizeFinancialDocument] model call failed:", err);
    return { ok: false, errorCode: "ai_normalization_failed", errorMessage: "The document could not be analyzed." };
  }

  const parsed = ExtractedFinancialDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("[normalizeFinancialDocument] schema validation failed:", parsed.error.issues[0]?.message);
    return {
      ok: false,
      errorCode: "schema_validation_failed",
      errorMessage: "Extracted data did not match the expected schema.",
    };
  }

  return { ok: true, extracted: parsed.data, raw };
}
