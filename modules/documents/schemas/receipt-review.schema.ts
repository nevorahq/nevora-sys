import { z } from "zod";
import { uuidSchema } from "@/lib/validators/common";

const MAX_MONEY = 999_999_999_999;
/** Same cap extraction applies when it stores the model's items. */
export const RECEIPT_ITEMS_MAX = 200;

const optionalAmount = z.number().min(0).max(MAX_MONEY).nullable();

export const receiptItemSchema = z.object({
  name: z.string().trim().min(1).max(240),
  quantity: z.number().positive().max(1_000_000).nullable(),
  unitPrice: optionalAmount,
  totalPrice: optionalAmount,
});

/** The corrected receipt the Inbox preview modal saves and posts. */
export const saveReviewedReceiptSchema = z.object({
  documentId: uuidSchema,
  suggestionId: uuidSchema,
  vendorName: z.string().trim().min(1).max(240),
  merchantTaxId: z
    .string()
    .trim()
    .max(64)
    .nullable()
    .transform((value) => value || null),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .transform((value) => value.toUpperCase()),
  amount: z.number().positive().max(MAX_MONEY),
  items: z.array(receiptItemSchema).max(RECEIPT_ITEMS_MAX),
  accountId: uuidSchema.optional(),
  categoryId: uuidSchema.nullable().optional(),
  expenseContextId: uuidSchema.nullable().optional(),
  rememberChoice: z.boolean().default(false),
});

export type SaveReviewedReceiptInput = z.infer<typeof saveReviewedReceiptSchema>;
