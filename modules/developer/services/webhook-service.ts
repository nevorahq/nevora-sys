import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import {
  assertPlanEntitlement,
  releaseOrganizationUsage,
  reserveOrganizationUsage,
} from "@/modules/billing";
import { hashDeveloperApiKey } from "./api-key-crypto";
import {
  DEVELOPER_WEBHOOK_EVENTS,
  type DeveloperWebhook,
  type DeveloperWebhookEvent,
} from "../types/developer.types";

export function generateWebhookSecret(): string {
  return `nva_whsec_${randomBytes(24).toString("base64url")}`;
}

export function signWebhookPayload(input: {
  secret: string;
  timestamp: string;
  payload: string;
}): string {
  return createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.payload}`)
    .digest("hex");
}

function normalizeEvents(events: string[]): DeveloperWebhookEvent[] {
  const allowed = new Set<string>(DEVELOPER_WEBHOOK_EVENTS);
  return Array.from(new Set(events.filter((event) => allowed.has(event)))) as DeveloperWebhookEvent[];
}

export async function listDeveloperWebhooks(
  organizationId: string,
): Promise<DeveloperWebhook[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("developer_webhooks")
    .select("id, organization_id, url, events, is_active, created_by, created_at, updated_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listDeveloperWebhooks error:", error);
    return [];
  }

  return (data ?? []) as DeveloperWebhook[];
}

export async function createDeveloperWebhook(input: {
  organizationId: string;
  url: string;
  events: string[];
  createdBy: string;
}): Promise<{ webhook: DeveloperWebhook; rawSecret: string }> {
  const events = normalizeEvents(input.events);
  if (events.length === 0) throw new Error("At least one valid webhook event is required");

  await assertPlanEntitlement(input.organizationId, "developer_webhooks.enabled");
  await reserveOrganizationUsage(input.organizationId, "developer_webhooks.count", 1);

  // Release the reservation exactly once on any failure — a returned PostgREST
  // error OR a thrown exception between reserve and a committed row (P1-3).
  let committed = false;
  try {
    const rawSecret = generateWebhookSecret();

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("developer_webhooks")
      .insert({
        organization_id: input.organizationId,
        url: input.url.trim(),
        secret_hash: hashDeveloperApiKey(rawSecret),
        events,
        created_by: input.createdBy,
      })
      .select("id, organization_id, url, events, is_active, created_by, created_at, updated_at")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to create webhook");
    }

    committed = true;
    return { webhook: data as DeveloperWebhook, rawSecret };
  } finally {
    if (!committed) {
      await releaseOrganizationUsage(input.organizationId, "developer_webhooks.count", 1);
    }
  }
}

export async function disableDeveloperWebhook(input: {
  organizationId: string;
  webhookId: string;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("developer_webhooks")
    .update({ is_active: false })
    .eq("id", input.webhookId)
    .eq("organization_id", input.organizationId);

  if (error) throw new Error(error.message);
}
