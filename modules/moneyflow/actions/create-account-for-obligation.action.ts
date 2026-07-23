"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { canDo } from "@/lib/context/current-context";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import { ACCOUNT_NAME_MAX, ACCOUNT_TYPES } from "../constants/moneyflow.constants";
import {
  createMoneyAccount,
  findActiveMoneyAccountsByCurrency,
  type MoneyAccountOption,
} from "../services/money-account-service";

/**
 * Inline Money-account creation from a blocked obligation.
 *
 * An organization with no account in the obligation's currency cannot complete
 * `Mark as paid` — the button is inert and the user is given no way forward.
 * This unblocks it in place, mirroring the document-expense CTA.
 *
 * Money safety:
 * - Creating an account posts NOTHING. It is not a financial fact; the payment
 *   still requires the explicit, idempotent Mark-as-paid workflow afterwards.
 * - The currency is derived on the SERVER from the obligation row, never taken
 *   from the client, so a caller cannot steer a payment into a foreign currency.
 * - The obligation is read org-scoped and must still be open; a settled or
 *   cross-org id yields the same safe not-found.
 * - `creationRequestId` makes a double submit return the original row.
 */

export type InlineObligationAccountResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  account?: MoneyAccountOption;
  created?: boolean;
};

/** The obligation surfaces that can be blocked on a missing account. */
export const OBLIGATION_KINDS = ["financial_task", "subscription_cycle"] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];

const schema = z.object({
  obligationKind: z.enum(OBLIGATION_KINDS),
  obligationId: z.string().uuid(),
  creationRequestId: z.string().uuid(),
  name: z.string().trim().min(1).max(ACCOUNT_NAME_MAX),
  type: z.enum(ACCOUNT_TYPES),
});

export async function createAccountForObligationAction(
  _previousState: InlineObligationAccountResult,
  formData: FormData,
): Promise<InlineObligationAccountResult> {
  const { dict } = await getDictionary();
  const t = dict.money.inlineAccount.errors;

  const parsed = schema.safeParse({
    obligationKind: formData.get("obligationKind"),
    obligationId: formData.get("obligationId"),
    creationRequestId: formData.get("creationRequestId"),
    name: formData.get("name"),
    type: formData.get("type"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return { error: denied.error };
    throw err;
  }
  if (!canDo(ctx, "data.write")) {
    return { error: t.permission };
  }

  try {
    const supabase = await createClient();
    const obligation = await loadOpenObligation(
      supabase,
      ctx.org.id,
      parsed.data.obligationKind,
      parsed.data.obligationId,
    );

    if (obligation === "error") return { error: t.lookupFailed };
    if (!obligation) return { error: t.notFound };

    const { currency } = obligation;

    // An account may already exist (a parallel tab, or a concurrent create).
    const { data: compatible, error: lookupError } = await findActiveMoneyAccountsByCurrency(
      supabase,
      ctx.org.id,
      currency,
    );
    if (lookupError) {
      console.error("createAccountForObligation lookup error:", lookupError);
      return { error: t.lookupFailed };
    }

    const existing = compatible?.[0] as MoneyAccountOption | undefined;
    if (existing) {
      revalidateObligationPaths();
      return { account: existing, created: false };
    }

    const result = await createMoneyAccount(supabase, ctx, {
      name: parsed.data.name,
      type: parsed.data.type,
      initialBalance: 0,
      currency,
      creationRequestId: parsed.data.creationRequestId,
    });

    if (!result.ok) {
      console.error("createAccountForObligation insert error:", result.error);
      return { error: t.createFailed };
    }

    revalidateObligationPaths();
    return { account: result.account, created: result.created };
  } catch (err) {
    console.error("createAccountForObligation unexpected error:", err);
    return { error: t.createFailed };
  }
}

/**
 * Read the obligation org-scoped and return its currency, or `null` when it is
 * missing / settled / owned by another organization (one safe not-found).
 */
async function loadOpenObligation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  kind: ObligationKind,
  obligationId: string,
): Promise<{ currency: string } | null | "error"> {
  if (kind === "financial_task") {
    const { data, error } = await supabase
      .from("todos")
      .select("id, currency, financial_status")
      .eq("id", obligationId)
      .eq("organization_id", organizationId)
      .eq("financial_status", "open")
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error("createAccountForObligation task lookup error:", error);
      return "error";
    }
    const currency = data?.currency as string | null | undefined;
    return currency ? { currency } : null;
  }

  const { data, error } = await supabase
    .from("subscription_payment_cycles")
    .select("id, currency, status")
    .eq("id", obligationId)
    .eq("organization_id", organizationId)
    .in("status", ["planned", "task_open", "failed"])
    .maybeSingle();

  if (error) {
    console.error("createAccountForObligation cycle lookup error:", error);
    return "error";
  }
  const currency = data?.currency as string | null | undefined;
  return currency ? { currency } : null;
}

function revalidateObligationPaths(): void {
  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.tasks);
  revalidatePath(ROUTES.subscriptions);
}
