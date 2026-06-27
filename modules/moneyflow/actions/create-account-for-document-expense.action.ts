"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import { ACCOUNT_NAME_MAX, ACCOUNT_TYPES } from "../constants/moneyflow.constants";
import {
  createMoneyAccount,
  findActiveMoneyAccountsByCurrency,
  type MoneyAccountOption,
} from "../services/money-account-service";

export type InlineAccountCreationResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  account?: MoneyAccountOption;
  created?: boolean;
};

const inlineAccountSchema = z.object({
  transactionId: z.string().uuid("Invalid transaction ID."),
  creationRequestId: z.string().uuid("Invalid account creation request."),
  name: z.string().trim().min(1, "Account name is required.").max(ACCOUNT_NAME_MAX),
  type: z.enum(ACCOUNT_TYPES, { error: "Choose a valid account type." }),
});

export async function createAccountForDocumentExpenseAction(
  _previousState: InlineAccountCreationResult,
  formData: FormData,
): Promise<InlineAccountCreationResult> {
  const parsed = inlineAccountSchema.safeParse({
    transactionId: formData.get("transactionId"),
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

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: "You do not have permission to create Money accounts." };
  }

  try {
    const supabase = await createClient();
    const { data: draft, error: draftError } = await supabase
      .from("money_transactions")
      .select("id, currency, source_document_id")
      .eq("id", parsed.data.transactionId)
      .eq("organization_id", ctx.org.id)
      .eq("status", "planned")
      .not("source_document_id", "is", null)
      .is("deleted_at", null)
      .maybeSingle();

    if (draftError) {
      console.error("createAccountForDocumentExpense draft error:", draftError);
      return { error: "The expense could not be loaded. Please try again." };
    }
    if (!draft) {
      return { error: "Draft expense not found or already confirmed." };
    }

    const currency = draft.currency as string;
    const { data: compatibleAccounts, error: accountLookupError } =
      await findActiveMoneyAccountsByCurrency(supabase, ctx.org.id, currency);

    if (accountLookupError) {
      console.error("createAccountForDocumentExpense account lookup error:", accountLookupError);
      return { error: "Money accounts could not be checked. Please try again." };
    }

    const existing = compatibleAccounts?.[0] as MoneyAccountOption | undefined;
    if (existing) {
      revalidateAccountPaths(draft.source_document_id as string);
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
      console.error("createAccountForDocumentExpense insert error:", result.error);
      return { error: "The account could not be created. Please try again." };
    }

    revalidateAccountPaths(draft.source_document_id as string);
    return { account: result.account, created: result.created };
  } catch (error) {
    console.error("createAccountForDocumentExpense unexpected error:", error);
    return { error: "The account could not be created. Please try again." };
  }
}

function revalidateAccountPaths(documentId: string): void {
  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  revalidatePath(`${ROUTES.documents}/${documentId}`);
}
