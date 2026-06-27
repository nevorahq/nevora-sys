import { z } from "zod";

/**
 * Strict schema for AI-normalized financial document data.
 *
 * The model is instructed to return ONLY this shape. We parse its output with
 * Zod before any of it touches the database — invalid output → schema_validation
 * failure → manual review, never a half-written transaction.
 *
 * `nullable` everywhere because the model must use null (not invent) for any
 * value it cannot read from the document.
 */
export const ExtractedFinancialDocumentSchema = z.object({
  documentType: z.enum(["receipt", "invoice", "payment_confirmation", "unknown"]),

  merchant: z.object({
    name: z.string().nullable(),
    taxId: z.string().nullable(),
    address: z.string().nullable(),
  }),

  transaction: z.object({
    date: z.string().nullable(),          // ISO 8601 (YYYY-MM-DD) when present
    currency: z.string().default("EUR"),  // ISO 4217
    subtotal: z.number().nullable(),
    tax: z.number().nullable(),
    total: z.number().nullable(),
    paymentMethod: z.string().nullable(),
    documentNumber: z.string().nullable().default(null),
  }),

  items: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().nullable(),
        unitPrice: z.number().nullable(),
        totalPrice: z.number().nullable(),
        taxRate: z.number().nullable(),
        category: z.string().nullable(),
      }),
    )
    .default([]),

  confidence: z.object({
    overall: z.number().min(0).max(1),
    merchant: z.number().min(0).max(1),
    date: z.number().min(0).max(1),
    total: z.number().min(0).max(1),
    items: z.number().min(0).max(1),
  }),

  suggestedActions: z
    .array(
      z.object({
        type: z.enum([
          "create_transaction",
          "link_subscription",
          "create_task",
          "request_review",
        ]),
        reason: z.string(),
      }),
    )
    .default([]),
});

export type ExtractedFinancialDocument = z.infer<typeof ExtractedFinancialDocumentSchema>;
