import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  assertPlanEntitlement,
  releaseOrganizationUsage,
  reserveOrganizationUsage,
} from "@/modules/billing";
import {
  DEVELOPER_API_KEY_SCOPES,
  type AuthenticatedApiKey,
  type CreatedDeveloperApiKey,
  type DeveloperApiKey,
  type DeveloperApiKeyScope,
} from "../types/developer.types";
import {
  developerApiKeyPrefix,
  generateDeveloperApiKey,
  hashDeveloperApiKey,
} from "./api-key-crypto";

function normalizeScopes(scopes: string[]): DeveloperApiKeyScope[] {
  const allowed = new Set<string>(DEVELOPER_API_KEY_SCOPES);
  return Array.from(new Set(scopes.filter((scope) => allowed.has(scope)))) as DeveloperApiKeyScope[];
}

export function assertApiKeyScope(
  auth: Pick<AuthenticatedApiKey, "scopes">,
  scope: DeveloperApiKeyScope,
): void {
  if (!auth.scopes.includes(scope)) {
    throw new Error("missing_api_scope");
  }
}

export async function listDeveloperApiKeys(
  organizationId: string,
): Promise<DeveloperApiKey[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("developer_api_keys")
    .select(
      "id, organization_id, name, key_prefix, scopes, last_used_at, expires_at, created_by, revoked_at, created_at, updated_at",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listDeveloperApiKeys error:", error);
    return [];
  }

  return (data ?? []) as DeveloperApiKey[];
}

export async function createDeveloperApiKey(input: {
  organizationId: string;
  name: string;
  scopes: string[];
  createdBy: string;
  expiresAt?: string | null;
  environment?: "live" | "test";
}): Promise<CreatedDeveloperApiKey> {
  const scopes = normalizeScopes(input.scopes);
  if (scopes.length === 0) throw new Error("At least one valid API scope is required");

  await assertPlanEntitlement(input.organizationId, "developer_access.enabled");
  await assertPlanEntitlement(input.organizationId, "public_api.enabled");
  await reserveOrganizationUsage(input.organizationId, "developer_api_keys.count", 1);

  // Release the reservation exactly once on any failure — a returned PostgREST
  // error OR a thrown exception between reserve and a committed row (P1-3).
  let committed = false;
  try {
    const rawKey = generateDeveloperApiKey(input.environment ?? "live");

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("developer_api_keys")
      .insert({
        organization_id: input.organizationId,
        name: input.name.trim(),
        key_hash: hashDeveloperApiKey(rawKey),
        key_prefix: developerApiKeyPrefix(rawKey),
        scopes,
        expires_at: input.expiresAt ?? null,
        created_by: input.createdBy,
      })
      .select(
        "id, organization_id, name, key_prefix, scopes, last_used_at, expires_at, created_by, revoked_at, created_at, updated_at",
      )
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to create API key");
    }

    committed = true;
    return {
      rawKey,
      key: data as DeveloperApiKey,
    };
  } finally {
    if (!committed) {
      await releaseOrganizationUsage(input.organizationId, "developer_api_keys.count", 1);
    }
  }
}

export async function revokeDeveloperApiKey(input: {
  organizationId: string;
  apiKeyId: string;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("developer_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", input.apiKeyId)
    .eq("organization_id", input.organizationId);

  if (error) throw new Error(error.message);
}

export async function validateDeveloperApiKey(rawKey: string): Promise<AuthenticatedApiKey | null> {
  if (!rawKey.startsWith("nva_live_") && !rawKey.startsWith("nva_test_")) {
    return null;
  }

  const keyHash = hashDeveloperApiKey(rawKey);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("validate_developer_api_key", {
    p_key_hash: keyHash,
  });

  if (error || !data) {
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    api_key_id: string;
    organization_id: string;
    organization_name: string;
    organization_slug: string | null;
    plan_code: string;
    scopes: DeveloperApiKeyScope[];
    rejection_reason: string | null;
  } | null;

  if (!row) return null;

  return {
    apiKeyId: row.api_key_id,
    keyHash,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    planCode: row.plan_code,
    scopes: row.scopes ?? [],
    rejectionReason: row.rejection_reason,
  };
}
