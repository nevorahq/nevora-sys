import "server-only";

import { createClient } from "@/lib/supabase/server";
import { resolveAccountLimits } from "@/lib/billing";
import { getInvoices, getPlans, getSubscription } from "@/modules/billing";
import { requireSettingsPermission } from "../utils/settings-permissions";
import type { BillingSettingsOverview, UsageLimit } from "../types/settings.types";

export async function getBillingOverview(): Promise<BillingSettingsOverview> {
  const { org, user } = await requireSettingsPermission("billing.read");
  const supabase = await createClient();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [subscription, plans, invoices, limits, members, aiRequests, attachments] = await Promise.all([
    getSubscription(org.id),
    getPlans(),
    getInvoices(org.id),
    resolveAccountLimits(user.id, org.id),
    supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .in("status", ["active", "invited"]),
    supabase
      .from("ai_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("document_attachments")
      .select("file_size")
      .eq("organization_id", org.id),
  ]);

  const storageMb = Math.ceil(
    ((attachments.data ?? []) as { file_size: number | null }[]).reduce(
      (total, row) => total + (row.file_size ?? 0),
      0,
    ) / (1024 * 1024),
  );

  const usage: UsageLimit[] = [
    { key: "members", label: "Members / seats", used: members.count ?? 0, limit: limits.maxMembers },
    { key: "storage", label: "Storage", used: storageMb, limit: limits.maxStorageMb, unit: "MB" },
    { key: "ai_requests", label: "AI requests this month", used: aiRequests.count ?? 0, limit: limits.maxAiRequestsPerMonth },
  ];

  return {
    subscription,
    plans,
    invoices,
    usage,
    providerConnected: Boolean(subscription?.external_id),
    unlimitedAccess: limits.unlimitedAccess,
  };
}
