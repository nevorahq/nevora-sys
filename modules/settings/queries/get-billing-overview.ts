import "server-only";

import { createClient } from "@/lib/supabase/server";
import { resolveAccountLimits } from "@/lib/billing";
import { getInvoices, getOrganizationAccessState, getPlanEntitlement, getPlanLimit, getPlans, getSubscription, getTrialEligibilityForCurrentUser, getUsage } from "@/modules/billing";
import { requireSettingsPermission } from "../utils/settings-permissions";
import type { BillingSettingsOverview, UsageLimit } from "../types/settings.types";

export async function getBillingOverview(): Promise<BillingSettingsOverview> {
  const { org, user } = await requireSettingsPermission("billing.read");
  const supabase = await createClient();

  const [
    subscription,
    accessState,
    plans,
    invoices,
    limits,
    members,
    storage,
    tasks,
    documents,
    documentsProcessed,
    documentsProcessedLimit,
    moneyTransactions,
    subscriptions,
    aiRequests,
    aiSuggestions,
    aiSuggestionsLimit,
    automationRuns,
    automationRunsLimit,
    apiRequests,
    apiRequestsLimit,
    publicApi,
    trialEligibility,
    auditResult,
  ] = await Promise.all([
    getSubscription(org.id),
    getOrganizationAccessState(org.id),
    getPlans(),
    getInvoices(org.id),
    resolveAccountLimits(user.id, org.id),
    getUsage(org.id, "members.count"),
    getUsage(org.id, "storage.bytes"),
    getUsage(org.id, "tasks.count"),
    getUsage(org.id, "documents.count"),
    getUsage(org.id, "documents_processed.monthly"),
    getPlanLimit(org.id, "documents_processed.monthly"),
    getUsage(org.id, "money_transactions.count"),
    getUsage(org.id, "subscriptions.count"),
    getUsage(org.id, "ai_requests.monthly"),
    getUsage(org.id, "ai_suggestions.monthly"),
    getPlanLimit(org.id, "ai_suggestions.monthly"),
    getUsage(org.id, "automation_runs.monthly"),
    getPlanLimit(org.id, "automation_runs.monthly"),
    getUsage(org.id, "api_requests.monthly"),
    getPlanLimit(org.id, "api_requests.monthly"),
    getPlanEntitlement(org.id, "public_api.enabled"),
    getTrialEligibilityForCurrentUser(),
    supabase
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id),
  ]);

  const usage: UsageLimit[] = [
    { key: "members", label: "Members", used: members.value, limit: limits.maxMembers },
    { key: "storage", label: "Storage", used: Math.ceil(storage.value / (1024 * 1024)), limit: limits.maxStorageMb, unit: "MB" },
    { key: "tasks", label: "Tasks", used: tasks.value, limit: limits.maxTasks },
    { key: "documents", label: "Documents", used: documents.value, limit: limits.maxDocuments },
    { key: "documents_processed", label: "Documents processed", used: documentsProcessed.value, limit: documentsProcessedLimit?.value ?? limits.maxDocuments },
    { key: "money_transactions", label: "Money transactions", used: moneyTransactions.value, limit: limits.maxMoneyTransactions },
    { key: "subscriptions", label: "Subscriptions", used: subscriptions.value, limit: limits.maxSubscriptions },
    { key: "ai_requests", label: "AI requests", used: aiRequests.value, limit: limits.maxAiRequestsPerMonth },
    { key: "ai_suggestions", label: "AI suggestions", used: aiSuggestions.value, limit: aiSuggestionsLimit?.value ?? limits.maxAiRequestsPerMonth },
    { key: "automation_runs", label: "Automation runs", used: automationRuns.value, limit: automationRunsLimit?.value ?? null },
  ];

  if (publicApi?.value === true) {
    usage.push({ key: "api_requests", label: "API requests", used: apiRequests.value, limit: apiRequestsLimit?.value ?? null });
  }

  return {
    subscription,
    accessState,
    plans,
    invoices,
    usage,
    providerConnected: Boolean(subscription?.external_id),
    unlimitedAccess: limits.unlimitedAccess,
    trialEligibility,
    recentAuditEvents: auditResult.count ?? 0,
  };
}
