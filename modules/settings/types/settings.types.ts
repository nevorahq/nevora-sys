import type { Invoice, Plan, SubscriptionWithPlan, TrialEligibility } from "@/modules/billing";
import type { OrgAccessState } from "@/modules/billing";
import type { BillingMode } from "@/modules/billing/config/paddle-env";

export type SettingsPermission =
  | "profile.read"
  | "profile.update"
  | "workspace.read"
  | "workspace.update"
  | "members.read"
  | "members.invite"
  | "members.update_role"
  | "members.remove"
  | "billing.read"
  | "billing.manage";

export type SettingsRole = "owner" | "admin" | "member";
export type BusinessType =
  | "freelancer"
  | "beauty_services"
  | "small_business"
  | "developer_agency"
  | "other";

export interface ProfileSettings {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  phone: string;
  language: "en" | "ru" | "ro";
  timezone: string;
}

export interface WorkspaceSettings {
  organizationId: string;
  workspaceId: string;
  organizationName: string;
  workspaceName: string;
  logoUrl: string | null;
  businessType: BusinessType;
  defaultCurrency: string;
  defaultLanguage: "en" | "ru" | "ro";
  timezone: string;
}

export interface SettingsMember {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  role: SettingsRole;
  status: "active" | "invited" | "disabled";
  lastActiveAt: string | null;
}

export interface UsageLimit {
  key:
    | "members"
    | "storage"
    | "tasks"
    | "documents"
    | "documents_processed"
    | "money_transactions"
    | "subscriptions"
    | "ai_requests"
    | "ai_suggestions"
    | "automation_runs"
    | "api_requests";
  label: string;
  used: number;
  limit: number | null;
  unit?: string;
}

export interface BillingSettingsOverview {
  subscription: SubscriptionWithPlan | null;
  accessState: OrgAccessState;
  plans: Plan[];
  invoices: Invoice[];
  usage: UsageLimit[];
  billingMode: BillingMode;
  billingConfigMissing: string[];
  providerConnected: boolean;
  unlimitedAccess: boolean;
  trialEligibility: TrialEligibility;
  recentAuditEvents: number;
}

export interface SettingsActionState {
  success?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  portalUrl?: string;
  /**
   * Set when account deletion is refused because the user is the sole owner of
   * one or more shared organizations. The UI lists them so the user knows what
   * to resolve (transfer ownership / remove members) first.
   */
  blockingOrgs?: { name: string; otherActiveMembers: number }[];
}
