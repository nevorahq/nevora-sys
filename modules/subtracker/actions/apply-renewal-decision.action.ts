"use server";

import { revalidatePath } from "next/cache";
import { addDaysISO } from "@nevora/subscriptions-contracts";
import { createClient } from "@/lib/supabase/server";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { requireAppAccess, accessErrorToActionResult } from "@/platform/access/server";
import { createGeneratedTaskRecord } from "@/platform/task-lifecycle/server";
import { ROUTES } from "@/shared/config/routes";
import { renewalDecisionSchema, type RenewalDecisionInput } from "../schemas/renewal-decision.schema";

export type RenewalDecisionResult = {
  ok: boolean;
  error?: string;
  renewalCaseId?: string;
  taskId?: string;
  status?: "pending" | "reviewing" | "keep" | "wont_renew";
};

export async function applyRenewalDecisionAction(
  input: RenewalDecisionInput,
): Promise<RenewalDecisionResult> {
  const parsed = renewalDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid renewal decision." };
  }

  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
  } catch (error) {
    const denied = accessErrorToActionResult(error);
    if (denied) return { ok: false, error: denied.error ?? "Access denied." };
    throw error;
  }

  const supabase = await createClient();
  const { data: renewalCase, error: loadError } = await supabase
    .from("subscription_renewal_cases")
    .select("id, organization_id, workspace_id, subscription_id, renewal_date, decision_due_date, status, snoozed_until, review_task_id, cancellation_task_id, updated_at")
    .eq("id", parsed.data.renewalCaseId)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (loadError || !renewalCase) return { ok: false, error: "Renewal case not found." };

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id, name, url, is_active, workspace_id")
    .eq("id", renewalCase.subscription_id as string)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!subscription || !subscription.is_active) return { ok: false, error: "Subscription is inactive." };

  const today = new Date().toISOString().slice(0, 10);
  let taskId: string | null = null;
  let nextStatus: "pending" | "reviewing" | "keep" | "wont_renew";

  if (parsed.data.action === "review") {
    nextStatus = "reviewing";
    taskId = renewalCase.review_task_id as string | null;
    if (!taskId) {
      const dayBeforeDecision = addDaysISO(renewalCase.decision_due_date as string, -1);
      const threeDaysFromNow = addDaysISO(today, 3);
      const dueDate = [dayBeforeDecision, threeDaysFromNow]
        .sort()[0] < today ? today : [dayBeforeDecision, threeDaysFromNow].sort()[0];
      const taskResult = await createGeneratedTaskRecord({
        supabase,
        ctx,
        title: `Review ${subscription.name as string} renewal`,
        dueDate,
        workspaceId: (renewalCase.workspace_id as string | null) ?? (subscription.workspace_id as string | null),
      });
      if (!taskResult.ok) return { ok: false, error: taskResult.error };
      taskId = taskResult.taskId;
    }
  } else if (parsed.data.action === "keep") {
    nextStatus = "keep";
  } else if (parsed.data.action === "wont_renew") {
    nextStatus = "wont_renew";
    taskId = renewalCase.cancellation_task_id as string | null;
    if (parsed.data.createCancellationTask && !taskId) {
      const dueDate = renewalCase.decision_due_date as string < today
        ? today
        : renewalCase.decision_due_date as string;
      const taskResult = await createGeneratedTaskRecord({
        supabase,
        ctx,
        title: `Cancel ${subscription.name as string} with provider`,
        dueDate,
        workspaceId: (renewalCase.workspace_id as string | null) ?? (subscription.workspace_id as string | null),
      });
      if (!taskResult.ok) return { ok: false, error: taskResult.error };
      taskId = taskResult.taskId;
    }
  } else if (parsed.data.action === "reopen") {
    nextStatus = "pending";
  } else {
    nextStatus = renewalCase.status as "pending" | "reviewing";
    const snoozeTime = Date.parse(parsed.data.snoozedUntil as string);
    const renewalEnd = Date.parse(`${renewalCase.renewal_date as string}T23:59:59.999Z`);
    if (snoozeTime <= Date.now() || snoozeTime > renewalEnd) {
      return { ok: false, error: "Choose a reminder before the renewal date." };
    }
  }

  const resolved = nextStatus === "keep" || nextStatus === "wont_renew";
  const update = {
    status: nextStatus,
    snoozed_until: parsed.data.action === "snooze" ? parsed.data.snoozedUntil : null,
    decision_note: parsed.data.note,
    decided_at: resolved ? new Date().toISOString() : null,
    decided_by: resolved ? ctx.user.id : null,
    review_task_id: parsed.data.action === "review" ? taskId : renewalCase.review_task_id,
    cancellation_task_id: parsed.data.action === "wont_renew" ? taskId : renewalCase.cancellation_task_id,
  };

  const { data: updated, error: updateError } = await supabase
    .from("subscription_renewal_cases")
    .update(update)
    .eq("id", renewalCase.id as string)
    .eq("organization_id", ctx.org.id)
    .eq("updated_at", parsed.data.expectedUpdatedAt)
    .select("id")
    .maybeSingle();
  if (updateError) {
    console.error("applyRenewalDecisionAction failed:", updateError.message);
    return { ok: false, error: "We couldn’t save the decision. Try again." };
  }
  if (!updated) return { ok: false, error: "This subscription changed. Refresh and review the renewal date." };

  const eventName = parsed.data.action === "review"
    ? "subscription.renewal_decision.review_started"
    : parsed.data.action === "wont_renew"
      ? "subscription.renewal_decision.wont_renew"
      : parsed.data.action === "snooze"
        ? "subscription.renewal_decision.snoozed"
        : parsed.data.action === "reopen"
          ? "subscription.renewal_decision.reopened"
          : "subscription.renewal_decision.keep";

  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: (renewalCase.workspace_id as string | null) ?? undefined,
      eventName,
      aggregateType: "subscription",
      aggregateId: subscription.id as string,
      payload: {
        subscription_id: subscription.id,
        renewal_case_id: renewalCase.id,
        previous_status: renewalCase.status,
        status: nextStatus,
        renewal_date: renewalCase.renewal_date,
        decision_due_date: renewalCase.decision_due_date,
        task_id: taskId,
        snoozed_until: parsed.data.snoozedUntil,
      },
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "subscription_renewal_cases",
      entityId: renewalCase.id as string,
      action: "status_change",
      oldData: { status: renewalCase.status, snoozed_until: renewalCase.snoozed_until },
      newData: { ...update, decision_note: parsed.data.note ? "[redacted]" : null },
      metadata: { source: "dashboard", surface: "subscriptions_renewal_inbox", action: parsed.data.action },
    }),
  ]);

  revalidatePath(ROUTES.subscriptions);
  revalidatePath(`${ROUTES.subscriptions}/${subscription.id as string}`);
  revalidatePath(ROUTES.actions);
  revalidatePath(ROUTES.tasks);
  return { ok: true, renewalCaseId: renewalCase.id as string, taskId: taskId ?? undefined, status: nextStatus };
}
