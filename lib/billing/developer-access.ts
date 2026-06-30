"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/shared/config/routes";
import type { AccountRole } from "./account-limits";

export type DeveloperAccessState = {
  userId: string;
  accountRole: AccountRole;
  unlimitedAccess: boolean;
};

async function setDeveloperAccess(
  targetUserId: string,
  enabled: boolean,
  reason: string,
): Promise<DeveloperAccessState> {
  await requireUser();

  const normalizedReason = reason.trim();
  if (!targetUserId || normalizedReason.length < 3 || normalizedReason.length > 500) {
    throw new Error("A target user and a reason between 3 and 500 characters are required");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_developer_access", {
    p_target_user_id: targetUserId,
    p_enabled: enabled,
    p_reason: normalizedReason,
  });

  if (error) {
    if (error.message.includes("developer_access_not_authorized")) {
      throw new Error("Only internal account admins or owners can manage Developer Access");
    }
    throw new Error(`Failed to update Developer Access: ${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    user_id: string;
    account_role: AccountRole;
    unlimited_access: boolean;
  } | null;

  if (!row) throw new Error("Developer Access update returned no state");

  revalidatePath(ROUTES.billing);
  revalidatePath(ROUTES.members);

  return {
    userId: row.user_id,
    accountRole: row.account_role,
    unlimitedAccess: row.unlimited_access,
  };
}

export async function enableDeveloperAccess(
  targetUserId: string,
  reason = "Internal developer account",
): Promise<DeveloperAccessState> {
  return setDeveloperAccess(targetUserId, true, reason);
}

export async function disableDeveloperAccess(
  targetUserId: string,
  reason = "Developer access removed",
): Promise<DeveloperAccessState> {
  return setDeveloperAccess(targetUserId, false, reason);
}
