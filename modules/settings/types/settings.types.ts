import type { Invoice, Plan, SubscriptionWithPlan } from "@/modules/billing";

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
  language: "en" | "ru";
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
  defaultLanguage: "en" | "ru";
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
  key: "members" | "storage" | "ai_requests";
  label: string;
  used: number;
  limit: number | null;
  unit?: string;
}

export interface BillingSettingsOverview {
  subscription: SubscriptionWithPlan | null;
  plans: Plan[];
  invoices: Invoice[];
  usage: UsageLimit[];
  providerConnected: boolean;
  unlimitedAccess: boolean;
}

export interface SettingsActionState {
  success?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}
