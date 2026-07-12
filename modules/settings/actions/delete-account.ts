"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { maskEmail } from "@/lib/email/mask-email";
import { ROUTES } from "@/shared/config/routes";
import { requestAccountDeletionSchema } from "../schemas/delete-account.schema";
import { authorizeSettingsAction } from "../utils/settings-permissions";
import { zodActionError } from "../utils/action-errors";
import { evaluateAccountDeletion } from "../services/account-deletion-guard";
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  computePurgeAfter,
} from "../config/account-deletion";
import type { SettingsActionState } from "../types/settings.types";

/** True when the account has an email/password identity (so a password exists). */
function hasPasswordIdentity(user: { identities?: { provider: string }[] | null }): boolean {
  return (user.identities ?? []).some((i) => i.provider === "email");
}

/**
 * Verify the current user's password out-of-band, without touching the session
 * cookies. Uses a throwaway stateless client (no session persistence) so a
 * successful sign-in here never rewrites the caller's auth cookies.
 */
async function verifyPassword(email: string, password: string): Promise<boolean> {
  const verifier = createStatelessClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await verifier.auth.signInWithPassword({ email, password });
  return !error;
}

/**
 * Request self-service account deletion. Soft, reversible: writes a pending
 * `account_deletion_requests` row with a 30-day grace window, signs the user
 * out, and lets a cron purge do the irreversible delete later. Refuses if the
 * user is the sole owner of a shared organization (would strand its members).
 */
export async function requestAccountDeletion(
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const context = await authorizeSettingsAction("profile.update");
  if (!context) return { error: "You do not have access." };

  const parsed = requestAccountDeletionSchema.safeParse({
    confirmation: formData.get("confirmation"),
    password: formData.get("password"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return zodActionError(parsed.error);

  const { user } = context;
  const email = (user.email ?? "").trim().toLowerCase();

  // Factor 1: the typed confirmation must equal the account email.
  if (parsed.data.confirmation.trim().toLowerCase() !== email) {
    return { fieldErrors: { confirmation: ["This does not match your email."] } };
  }

  // Factor 2: password re-auth, only for accounts that actually have one.
  if (hasPasswordIdentity(user)) {
    if (!parsed.data.password) {
      return { fieldErrors: { password: ["Enter your password to confirm."] } };
    }
    const ok = await verifyPassword(email, parsed.data.password);
    if (!ok) {
      return { fieldErrors: { password: ["Incorrect password."] } };
    }
  }

  // Guard: block if the user is the sole owner of a shared organization.
  let guard;
  try {
    guard = await evaluateAccountDeletion(user.id);
  } catch (error) {
    console.error("requestAccountDeletion guard error:", error);
    return { error: "We could not verify your organizations. Please try again." };
  }
  if (guard.blocking.length > 0) {
    return {
      error:
        "You are the only owner of an organization with other members. Transfer ownership or remove the members before deleting your account.",
      blockingOrgs: guard.blocking.map((o) => ({
        name: o.organizationName,
        otherActiveMembers: o.otherActiveMembers,
      })),
    };
  }

  // Record the pending request (RLS: user_id must equal auth.uid()).
  const supabase = await createClient();
  const purgeAfter = computePurgeAfter();
  const { error: insertError } = await supabase
    .from("account_deletion_requests")
    .insert({
      user_id: user.id,
      purge_after: purgeAfter.toISOString(),
      reason: parsed.data.reason || null,
      created_via: "dashboard",
    });

  if (insertError) {
    // Unique partial index => a pending request already exists.
    if (insertError.code === "23505") {
      return { error: "Your account is already scheduled for deletion." };
    }
    console.error("requestAccountDeletion insert error:", insertError);
    return { error: "We could not schedule the deletion. Please try again." };
  }

  await Promise.all([
    emitAuditLog({
      organizationId: context.org.id,
      entityType: "account_deletion_requests",
      entityId: user.id,
      action: "create",
      newData: {
        email: maskEmail(user.email),
        grace_days: ACCOUNT_DELETION_GRACE_DAYS,
        purge_after: purgeAfter.toISOString(),
      },
      metadata: { source: "dashboard" },
    }),
    emitDomainEvent({
      organizationId: context.org.id,
      workspaceId: context.workspace.id,
      eventName: "user.deletion_requested",
      aggregateType: "user_account",
      aggregateId: user.id,
      payload: {
        graceDays: ACCOUNT_DELETION_GRACE_DAYS,
        soloOrganizations: guard.soloOrganizationIds.length,
      },
    }),
  ]);

  await supabase.auth.signOut();
  redirect(`${ROUTES.login}?account=deletion_scheduled`);
}

/**
 * Cancel a pending deletion request during the grace window. Reactivates the
 * account by flipping the row to 'cancelled'; the cron purge then ignores it.
 */
export async function cancelAccountDeletion(): Promise<SettingsActionState> {
  const context = await authorizeSettingsAction("profile.update");
  if (!context) return { error: "You do not have access." };

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("account_deletion_requests")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("user_id", context.user.id)
    .eq("status", "pending")
    .select("id");

  if (error) {
    console.error("cancelAccountDeletion error:", error);
    return { error: "We could not cancel the deletion. Please try again." };
  }
  if (!updated || updated.length === 0) {
    return { error: "No pending deletion to cancel." };
  }

  await Promise.all([
    emitAuditLog({
      organizationId: context.org.id,
      entityType: "account_deletion_requests",
      entityId: context.user.id,
      action: "update",
      newData: { status: "cancelled" },
      metadata: { source: "dashboard" },
    }),
    emitDomainEvent({
      organizationId: context.org.id,
      workspaceId: context.workspace.id,
      eventName: "user.deletion_cancelled",
      aggregateType: "user_account",
      aggregateId: context.user.id,
      payload: {},
    }),
  ]);

  revalidatePath(ROUTES.settingsProfile);
  revalidatePath(ROUTES.dashboard);
  return { success: "Account deletion cancelled." };
}
