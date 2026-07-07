"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { canDo } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import { uuidSchema } from "@/lib/validators/common";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";

export async function deleteSubscriptionAction(id: string): Promise<{ error?: string }> {
  const { dict } = await getDictionary();
  if (!uuidSchema.safeParse(id).success) {
    return { error: dict.subscriptions.errors.deleteFailed };
  }

  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "data.delete", intent: "write" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }
  if (!canDo(ctx, "data.delete")) {
    return { error: dict.subscriptions.errors.deleteFailed };
  }

  try {
    const supabase = await createClient();

    const { data: subscription, error: lookupError } = await supabase
      .from("subscriptions")
      .select("id, name, workspace_id")
      .eq("id", id)
      .eq("organization_id", ctx.org.id)
      .single();

    if (lookupError || !subscription) {
      console.error("deleteSubscription lookup error:", lookupError);
      return { error: dict.subscriptions.errors.deleteFailed };
    }

    const { error } = await supabase
      .from("subscriptions")
      .delete()
      .eq("id", subscription.id)
      .eq("organization_id", ctx.org.id);

    if (error) {
      console.error("deleteSubscription error:", error);
      return { error: dict.subscriptions.errors.deleteFailed };
    }

    await emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: (subscription.workspace_id as string | null) ?? undefined,
      eventName: "subscription.deleted",
      aggregateType: "subscription",
      aggregateId: subscription.id as string,
      payload: { name: subscription.name as string },
    });
  } catch (err) {
    console.error("deleteSubscription unexpected error:", err);
    return { error: dict.subscriptions.errors.serverError };
  }

  revalidatePath(ROUTES.subscriptions);
  revalidatePath(ROUTES.dashboard);
  return {};
}
