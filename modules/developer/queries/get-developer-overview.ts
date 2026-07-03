import "server-only";

import { requireOrg } from "@/lib/auth/require-org";
import {
  getPlanEntitlement,
  getUsage,
  getPlanLimit,
} from "@/modules/billing";
import {
  listDeveloperApiKeys,
} from "../services/api-key-service";
import { listDeveloperWebhooks } from "../services/webhook-service";

export async function getDeveloperOverview() {
  const ctx = await requireOrg();
  const [
    developerAccess,
    publicApi,
    developerWebhooks,
    apiKeys,
    webhooks,
    apiKeysUsage,
    apiKeysLimit,
    webhooksUsage,
    webhooksLimit,
    apiUsage,
    apiMonthlyLimit,
  ] = await Promise.all([
    getPlanEntitlement(ctx.org.id, "developer_access.enabled"),
    getPlanEntitlement(ctx.org.id, "public_api.enabled"),
    getPlanEntitlement(ctx.org.id, "developer_webhooks.enabled"),
    listDeveloperApiKeys(ctx.org.id),
    listDeveloperWebhooks(ctx.org.id),
    getUsage(ctx.org.id, "developer_api_keys.count"),
    getPlanLimit(ctx.org.id, "developer_api_keys.count"),
    getUsage(ctx.org.id, "developer_webhooks.count"),
    getPlanLimit(ctx.org.id, "developer_webhooks.count"),
    getUsage(ctx.org.id, "api_requests.monthly"),
    getPlanLimit(ctx.org.id, "api_requests.monthly"),
  ]);

  return {
    organizationId: ctx.org.id,
    canManage: ctx.permissions.has("developer.manage") || ["owner", "admin"].includes(ctx.membership.roleId),
    entitlements: {
      developerAccess: developerAccess?.value === true,
      publicApi: publicApi?.value === true,
      developerWebhooks: developerWebhooks?.value === true,
    },
    usage: {
      apiKeys: { used: apiKeysUsage.value, limit: apiKeysLimit?.value ?? null },
      webhooks: { used: webhooksUsage.value, limit: webhooksLimit?.value ?? null },
      apiRequestsMonthly: { used: apiUsage.value, limit: apiMonthlyLimit?.value ?? null },
    },
    apiKeys,
    webhooks,
  };
}
