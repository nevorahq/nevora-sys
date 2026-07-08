import { z } from "zod";
import { uuidSchema } from "@/lib/validators/common";
import {
  FINANCIAL_SUGGESTION_TYPES,
  SUBSCRIPTION_TASK_SUGGESTION_TYPES,
} from "../constants/review.constants";

const ISO_DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const optionalIsoDate = ISO_DATE.nullable().optional();
const optionalMoney = z.number().positive().max(999_999_999_999).nullable().optional();
const optionalCurrency = z.string().trim().length(3).transform((v) => v.toUpperCase()).nullable().optional();

export const createDocumentFinancialSuggestionSchema = z.object({
  documentId: uuidSchema,
  extractionId: uuidSchema.nullable().optional(),
  vendorName: z.string().trim().max(240).nullable().optional(),
  amount: optionalMoney,
  currency: optionalCurrency,
  issueDate: optionalIsoDate,
  dueDate: optionalIsoDate,
  documentType: z.string().trim().max(80).nullable().optional(),
  taxAmount: z.number().min(0).max(999_999_999_999).nullable().optional(),
  paymentStatus: z.string().trim().max(80).nullable().optional(),
  confidenceScore: z.number().min(0).max(1).nullable().optional(),
  rawExtractionJson: z.record(z.string(), z.unknown()).default({}),
  categoryId: uuidSchema.nullable().optional(),
  expenseContextId: uuidSchema.nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const editFinancialSuggestionSchema = z.object({
  suggestionId: uuidSchema,
  vendorName: z.string().trim().min(1).max(240).optional(),
  amount: z.number().positive().max(999_999_999_999).optional(),
  currency: z.string().trim().length(3).transform((v) => v.toUpperCase()).optional(),
  issueDate: ISO_DATE.nullable().optional(),
  dueDate: ISO_DATE.nullable().optional(),
  taxAmount: z.number().min(0).max(999_999_999_999).nullable().optional(),
  paymentStatus: z.string().trim().max(80).nullable().optional(),
  categoryId: uuidSchema.nullable().optional(),
  expenseContextId: uuidSchema.nullable().optional(),
});

export const confirmFinancialSuggestionSchema = z.object({
  suggestionId: uuidSchema,
  accountId: uuidSchema.optional(),
  categoryId: uuidSchema.nullable().optional(),
  expenseContextId: uuidSchema.nullable().optional(),
  vendorName: z.string().trim().min(1).max(240).optional(),
  amount: z.number().positive().max(999_999_999_999).optional(),
  transactionDate: ISO_DATE.optional(),
  currency: z.string().trim().length(3).transform((v) => v.toUpperCase()).optional(),
  rememberChoice: z.boolean().default(false),
});

export const rejectFinancialSuggestionSchema = z.object({
  suggestionId: uuidSchema,
  reason: z.string().trim().max(1_000).nullable().optional(),
});

export const createSubscriptionTaskSuggestionSchema = z.object({
  subscriptionId: uuidSchema,
  taskType: z.enum(SUBSCRIPTION_TASK_SUGGESTION_TYPES),
  billingPeriodKey: z.string().trim().max(80).nullable().optional(),
  dueDate: optionalIsoDate,
  amount: optionalMoney,
  currency: optionalCurrency,
  reason: z.string().trim().max(1_000).nullable().optional(),
  confidenceScore: z.number().min(0).max(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const confirmSubscriptionTaskSuggestionSchema = z.object({
  suggestionId: uuidSchema,
});

export const getReviewItemsSchema = z.object({
  state: z.enum(["detected", "suggested", "waiting_confirmation", "confirmed", "rejected"]).optional(),
  sourceType: z.enum(["document", "subscription", "relation"]).optional(),
  suggestionType: z.enum(FINANCIAL_SUGGESTION_TYPES).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export type CreateDocumentFinancialSuggestionParsed = z.infer<typeof createDocumentFinancialSuggestionSchema>;
export type EditFinancialSuggestionParsed = z.infer<typeof editFinancialSuggestionSchema>;
export type ConfirmFinancialSuggestionParsed = z.infer<typeof confirmFinancialSuggestionSchema>;
export type RejectFinancialSuggestionParsed = z.infer<typeof rejectFinancialSuggestionSchema>;
export type CreateSubscriptionTaskSuggestionParsed = z.infer<typeof createSubscriptionTaskSuggestionSchema>;
export type ConfirmSubscriptionTaskSuggestionParsed = z.infer<typeof confirmSubscriptionTaskSuggestionSchema>;
