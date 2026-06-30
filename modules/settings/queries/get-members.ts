import "server-only";

import { getMembers as getOrganizationMembers } from "@/modules/members";
import { requireSettingsPermission } from "../utils/settings-permissions";
import type { SettingsMember, SettingsRole } from "../types/settings.types";

export async function getMembers(): Promise<SettingsMember[]> {
  const { org } = await requireSettingsPermission("members.read");
  const members = await getOrganizationMembers(org.id);

  return members.map((member) => ({
    id: member.id,
    userId: member.userId,
    name: member.displayName,
    email: member.email,
    role: (member.role === "owner" || member.role === "admin" ? member.role : "member") as SettingsRole,
    status: member.status === "suspended" ? "disabled" : member.status,
    lastActiveAt: null,
  }));
}
