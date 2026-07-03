import "server-only";

import { resolveAccountLimits } from "@/lib/billing";
import { getInvoices, getPlanEntitlement, getPlanLimit, getPlans, getSubscription, getUsage } from "@/modules/billing";
import { requireSettingsPermission } from "../utils/settings-permissions";
import type { BillingSettingsOverview, UsageLimit } from "../types/settings.types";

export async function getBillingOverview(): Promise<BillingSettingsOverview> {
  const { org, user } = await requireSettingsPermission("billing.read");

  const [
    subscription,
    plans,
    invoices,
    limits,
    members,
    storage,
    tasks,
    documents,
    moneyTransactions,
    subscriptions,
    aiRequests,
    apiRequests,
    apiRequestsLimit,
    publicApi,
  ] = await Promise.all([
    getSubscription(org.id),
    getPlans(),
    getInvoices(org.id),
    resolveAccountLimits(user.id, org.id),
    getUsage(org.id, "members.count"),
    getUsage(org.id, "storage.bytes"),
    getUsage(org.id, "tasks.count"),
    getUsage(org.id, "documents.count"),
    getUsage(org.id, "money_transactions.count"),
    getUsage(org.id, "subscriptions.count"),
    getUsage(org.id, "ai_requests.monthly"),
    getUsage(org.id, "api_requests.monthly"),
    getPlanLimit(org.id, "api_requests.monthly"),
    getPlanEntitlement(org.id, "public_api.enabled"),
  ]);

  const usage: UsageLimit[] = [
    { key: "members", label: "Members", used: members.value, limit: limits.maxMembers },
    { key: "storage", label: "Storage", used: Math.ceil(storage.value / (1024 * 1024)), limit: limits.maxStorageMb, unit: "MB" },
    { key: "tasks", label: "Tasks", used: tasks.value, limit: limits.maxTasks },
    { key: "documents", label: "Documents", used: documents.value, limit: limits.maxDocuments },
    { key: "money_transactions", label: "Money transactions", used: moneyTransactions.value, limit: limits.maxMoneyTransactions },
    { key: "subscriptions", label: "Subscriptions", used: subscriptions.value, limit: limits.maxSubscriptions },
    { key: "ai_requests", label: "AI requests", used: aiRequests.value, limit: limits.maxAiRequestsPerMonth },
  ];

  if (publicApi?.value === true) {
    usage.push({ key: "api_requests", label: "API requests", used: apiRequests.value, limit: apiRequestsLimit?.value ?? null });
  }

  return {
    subscription,
    plans,
    invoices,
    usage,
    providerConnected: Boolean(subscription?.external_id),
    unlimitedAccess: limits.unlimitedAccess,
  };
}
