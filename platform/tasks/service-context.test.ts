import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TasksServiceClaims } from "@nevora/tasks-api";
import { resolveTasksServiceContext } from "./service-context";

const claims: TasksServiceClaims = {
  version: 1,
  issuer: "nevora-platform",
  audience: "nevora-tasks",
  subject: "33333333-3333-4333-8333-333333333333",
  organizationId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  permissions: ["org.read", "data.write"],
  operation: "createGeneratedTask",
  issuedAt: 1_800_000_000,
  expiresAt: 1_800_000_060,
  nonce: "44444444-4444-4444-8444-444444444444",
};

function serviceClient(membership: Record<string, unknown> | null = {
  id: "membership-1",
  organization_id: claims.organizationId,
  user_id: claims.subject,
  role: "member",
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
}): SupabaseClient {
  const rows: Record<string, Record<string, unknown> | null> = {
    organizations: {
      id: claims.organizationId,
      name: "Nevora",
      slug: "nevora",
      plan: "pro",
      base_currency: "EUR",
    },
    workspaces: { id: claims.workspaceId, name: "Main" },
    memberships: membership,
  };
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => ({ data: rows[table] ?? null, error: null }));
    return builder;
  });
  return { from } as unknown as SupabaseClient;
}

describe("resolveTasksServiceContext", () => {
  it("revalidates live tenant membership and rebuilds a minimal context", async () => {
    const context = await resolveTasksServiceContext(serviceClient(), claims);

    expect(context.org.id).toBe(claims.organizationId);
    expect(context.workspace.id).toBe(claims.workspaceId);
    expect(context.user.id).toBe(claims.subject);
    expect([...context.permissions]).toEqual(["org.read", "data.write"]);
  });

  it("fails when the signed actor no longer has an active membership", async () => {
    await expect(resolveTasksServiceContext(serviceClient(null), claims)).rejects.toThrow(
      "no longer authorized",
    );
  });
});
