"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent } from "@/lib/events";
import { checkPlanLimit } from "@/lib/billing";
import { getSubscriptionSchemas } from "../schemas/subscription.schema";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function createSubscriptionAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { dict } = await getDictionary();
  const { createSubscriptionSchema } = getSubscriptionSchemas(dict.subscriptions.errors);

  const { user, org, workspace } = await requireOrg();

  const limitCheck = await checkPlanLimit(org.id, "subscriptions");
  if (!limitCheck.allowed) {
    return { error: limitCheck.reason ?? "Subscription limit reached. Upgrade your plan." };
  }

  const rawData = {
    name: formData.get("name") as string,
    account_id: formData.get("account_id") as string,
    amount: formData.get("amount") as string,
    billing_cycle: formData.get("billing_cycle") as string,
    next_billing_date: formData.get("next_billing_date") as string,
    category: formData.get("category") as string,
    url: (formData.get("url") as string) || null,
    note: (formData.get("note") as string) || null,
  };

  const parsed = createSubscriptionSchema.safeParse(rawData);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  try {
    const supabase = await createClient();

    const { data: newSub, error } = await supabase
      .from("subscriptions")
      .insert({
        organization_id: org.id,
        workspace_id: workspace.id,
        created_by: user.id,
        updated_by: user.id,
        name: parsed.data.name,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        billing_cycle: parsed.data.billing_cycle,
        next_billing_date: parsed.data.next_billing_date,
        category: parsed.data.category,
        url: parsed.data.url,
        note: parsed.data.note,
      })
      .select("id")
      .single();

    if (error || !newSub) {
      console.error("createSubscription error:", error);
      return { error: dict.subscriptions.errors.createFailed };
    }

    await emitDomainEvent({
      organizationId: org.id,
      workspaceId: workspace.id,
      eventName: "subscription.created",
      aggregateType: "subscription",
      aggregateId: newSub.id,
      payload: {
        name: parsed.data.name,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        billing_cycle: parsed.data.billing_cycle,
      },
    });

    // ── Авто-транзакция: ближайшее списание по подписке ─────────────────
    // Это плановый расход на next_billing_date, а не платёж «сегодня».
    // Он попадёт в «Предстоящие расходы», но не изменит баланс до
    // подтверждения через planned → posted.
    // account_id проверяется RLS (EXISTS): чужой/несуществующий счёт БД
    // отклонит. Сбой здесь НЕ откатывает уже созданную подписку — логируем
    // и продолжаем.

    const { data: newTx, error: txError } = await supabase
      .from("money_transactions")
      .insert({
        organization_id: org.id,
        workspace_id: workspace.id,
        created_by: user.id,
        updated_by: user.id,
        title: parsed.data.name,
        type: "expense",
        amount: parsed.data.amount,
        account_id: parsed.data.account_id,
        category_id: null,
        transaction_date: parsed.data.next_billing_date,
        currency: parsed.data.currency,
        status: "planned",
        note: null,
      })
      .select("id")
      .single();

    if (txError || !newTx) {
      // Подписка создана, транзакцию завести не вышло — не критично.
      console.error("createSubscription auto-transaction error:", txError);
    } else {
      // transaction.created с subscription_id → on-transaction-created
      // создаст entity_link transaction --paid_by--> subscription.
      await emitDomainEvent({
        organizationId: org.id,
        workspaceId: workspace.id,
        eventName: "money.transaction.created",
        aggregateType: "transaction",
        aggregateId: newTx.id,
        payload: {
          amount: parsed.data.amount,
          type: "expense",
          currency: parsed.data.currency,
          account_id: parsed.data.account_id,
          category_id: null,
          transaction_date: parsed.data.next_billing_date,
          status: "planned",
          subscription_id: newSub.id,
        },
      });
    }
  } catch (err) {
    console.error("createSubscription unexpected error:", err);
    return { error: dict.subscriptions.errors.serverError };
  }

  revalidatePath(ROUTES.subscriptions);
  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  return {};
}
