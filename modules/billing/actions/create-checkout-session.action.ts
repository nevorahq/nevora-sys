"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { emitDomainEvent } from "@/lib/events";
import type { ActionResult } from "@/lib/validators/common";
import { changePlanSchema, type ChangePlanInput } from "../schemas/billing.schemas";
import { getPaddleConfig } from "../config/paddle-env";
import { billingProvider } from "../services/billing-provider";

export interface CheckoutActionState extends ActionResult {
  success?: string;
  redirectUrl?: string;
  code?: "PRIVATE_BETA" | "BILLING_CONFIG_MISSING";
}

async function getReturnUrl(): Promise<string> {
  const headerStore = await headers();
  const origin =
    headerStore.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";
  return `${origin}/dashboard/settings/billing`;
}

function fieldErrorsFromIssues(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "_form");
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }
  return fieldErrors;
}

export async function createCheckoutSessionForCurrentOrganization(
  input: ChangePlanInput,
): Promise<CheckoutActionState> {
  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "billing.manage", intent: "billing" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }

  if (!["admin", "owner"].includes(ctx.membership.roleId)) {
    return { error: "Only admins can manage billing." };
  }

  if (input.planSlug === "trial") {
    await emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "trial_reuse_blocked",
      aggregateType: "organization",
      aggregateId: ctx.org.id,
      payload: { reason: "trial_checkout_not_allowed" },
    });
    return {
      error: "The free trial can only be used once. Please choose Start, Pro or Business to continue.",
    };
  }

  const supabase = await createClient();
  const { data: plan, error } = await supabase
    .from("plans")
    .select("id, slug, is_active")
    .eq("slug", input.planSlug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return { error: "Could not load the selected plan." };
  if (!plan || plan.slug === "trial") return { error: "Please choose an available paid plan." };

  if (getPaddleConfig().mode === "private_beta") {
    return {
      code: "PRIVATE_BETA",
      error: "Nevora is in private beta. Paid checkout is not available yet; contact us to activate a paid plan.",
    };
  }

  const session = await billingProvider.createCheckoutSession({
    organizationId: ctx.org.id,
    actorId: ctx.user.id,
    planCode: input.planSlug,
    billingCycle: input.billingCycle,
    returnUrl: await getReturnUrl(),
  });

  if (!session.url) {
    return {
      code: "BILLING_CONFIG_MISSING",
      error:
        "Billing provider is not connected yet. Paid plans can only be activated after provider checkout and verified webhook are configured.",
    };
  }

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: input.source === "upgrade_prompt" ? "upgrade_prompt_clicked" : "checkout_started",
    aggregateType: "organization",
    aggregateId: ctx.org.id,
    payload: input.source === "upgrade_prompt"
      ? {
          metric_key: input.metricKey,
          target_plan_slug: input.planSlug,
        }
      : {
          plan_slug: input.planSlug,
          billing_cycle: input.billingCycle,
          provider: session.provider,
        },
  });

  if (input.source === "upgrade_prompt") {
    await emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "checkout_started",
      aggregateType: "organization",
      aggregateId: ctx.org.id,
      payload: {
        plan_slug: input.planSlug,
        billing_cycle: input.billingCycle,
        provider: session.provider,
      },
    });
  }

  return { success: "Redirecting to secure checkout.", redirectUrl: session.url };
}

export async function createCheckoutSessionAction(
  _prevState: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const parsed = changePlanSchema.safeParse({
    planSlug: formData.get("planSlug") as string,
    billingCycle: formData.get("billingCycle") as string,
    source: formData.get("source") || undefined,
    metricKey: formData.get("metricKey") || undefined,
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromIssues(parsed.error.issues) };
  }

  return createCheckoutSessionForCurrentOrganization(parsed.data);
}
