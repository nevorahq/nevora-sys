"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { canDo } from "@/lib/context/current-context";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";
import { saveReviewedReceiptSchema } from "../schemas/receipt-review.schema";
import {
  getReceiptReview,
  saveReviewedReceipt,
  type ReceiptReview,
} from "../services/receipt-review-service";

/**
 * Receipt review for the Inbox preview modal. Errors come back as codes; the
 * modal words them in the viewer's language.
 */

export type ReceiptReviewErrorCode =
  | "forbidden"
  | "invalid"
  | "not_found"
  | "handled"
  | "currency_mismatch"
  | "failed";

export async function getReceiptReviewAction(
  documentId: string,
): Promise<{ ok: true; review: ReceiptReview } | { ok: false; code: ReceiptReviewErrorCode }> {
  if (!uuidSchema.safeParse(documentId).success) return { ok: false, code: "invalid" };
  try {
    const ctx = await requireAppAccess({ intent: "read" });
    const review = await getReceiptReview(await createClient(), ctx, documentId);
    return review ? { ok: true, review } : { ok: false, code: "not_found" };
  } catch (error) {
    if (accessErrorToActionResult(error)) return { ok: false, code: "forbidden" };
    throw error;
  }
}

export async function saveReviewedReceiptAction(
  input: unknown,
): Promise<{ ok: true; transactionId: string } | { ok: false; code: ReceiptReviewErrorCode; message?: string }> {
  const parsed = saveReviewedReceiptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
  } catch (error) {
    const denied = accessErrorToActionResult(error);
    if (denied) return { ok: false, code: "forbidden", message: denied.error };
    throw error;
  }
  if (!canDo(ctx, "data.write")) return { ok: false, code: "forbidden" };

  const result = await saveReviewedReceipt(await createClient(), ctx, parsed.data);
  if (!result.ok) return { ok: false, code: result.code, message: result.error };

  revalidatePath(ROUTES.inbox);
  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.actions);
  revalidatePath(`${ROUTES.documents}/${parsed.data.documentId}`);
  return { ok: true, transactionId: result.transactionId };
}
