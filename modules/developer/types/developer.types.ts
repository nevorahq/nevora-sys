export const DEVELOPER_API_KEY_SCOPES = [
  "tasks:read",
  "tasks:write",
  "documents:read",
  "documents:write",
  "money:read",
  "money:write",
  "subscriptions:read",
  "subscriptions:write",
  "relations:read",
  "relations:write",
  "webhooks:manage",
] as const;

export type DeveloperApiKeyScope = (typeof DEVELOPER_API_KEY_SCOPES)[number];

export const DEVELOPER_WEBHOOK_EVENTS = [
  "task.created",
  "task.completed",
  "document.created",
  "money.transaction.created",
  "subscription.created",
  "billing.limit.exceeded",
] as const;

export type DeveloperWebhookEvent = (typeof DEVELOPER_WEBHOOK_EVENTS)[number];

export interface DeveloperApiKey {
  id: string;
  organization_id: string;
  name: string;
  key_prefix: string;
  scopes: DeveloperApiKeyScope[];
  last_used_at: string | null;
  expires_at: string | null;
  created_by: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatedDeveloperApiKey {
  key: DeveloperApiKey;
  rawKey: string;
}

export interface DeveloperWebhook {
  id: string;
  organization_id: string;
  url: string;
  events: DeveloperWebhookEvent[];
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AuthenticatedApiKey {
  apiKeyId: string;
  keyHash: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string | null;
  planCode: string;
  scopes: DeveloperApiKeyScope[];
  rejectionReason?: string | null;
}
