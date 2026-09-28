import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-org", () => ({
  permissionsForRole: (role: string) =>
    new Set(role === "viewer" ? ["org.read"] : ["data.write", "planner.entry.create"]),
}));

import { resolveChannelContext } from "./channel-context";

function fakeSupabase(opts: { membership?: unknown; writable?: boolean; workspace?: unknown }) {
  const reads: Record<string, unknown> = {
    organizations: { id: "org-1", name: "Acme", slug: "acme", plan: "pro", base_currency: "MDL" },
    memberships: opts.membership === undefined ? { id: "m1", organization_id: "org-1", user_id: "user-1", role: "member", status: "active", created_at: "t" } : opts.membership,
    workspaces: opts.workspace === undefined ? { id: "ws-1", name: "Main" } : opts.workspace,
  };
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit"]) builder[m] = () => builder;
    builder.maybeSingle = async () => ({ data: reads[table] ?? null });
    return builder;
  };
  const rpc = vi.fn(async () => ({ data: opts.writable ?? true, error: null }));
  return { client: { from, rpc } as unknown as SupabaseClient, rpc };
}

const integration = { organization_id: "org-1", workspace_id: "ws-1", user_id: "user-1" };

describe("resolveChannelContext", () => {
  it("rebuilds the user's context with their role's permissions", async () => {
    const { client, rpc } = fakeSupabase({});
    const result = await resolveChannelContext(client, integration);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ctx).toMatchObject({
      user: { id: "user-1" },
      org: { id: "org-1", baseCurrency: "MDL" },
      workspace: { id: "ws-1" },
      role: { name: "member" },
    });
    expect(result.ctx.permissions.has("planner.entry.create")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("is_organization_writable", { p_organization_id: "org-1" });
  });

  it("refuses a user who left the organization", async () => {
    const { client } = fakeSupabase({ membership: null });
    expect(await resolveChannelContext(client, integration)).toEqual({ ok: false, reason: "not_member" });
  });

  it("refuses a role that cannot capture", async () => {
    const { client } = fakeSupabase({
      membership: { id: "m1", organization_id: "org-1", user_id: "user-1", role: "viewer", status: "active", created_at: "t" },
    });
    expect(await resolveChannelContext(client, integration)).toEqual({ ok: false, reason: "forbidden" });
  });

  it("refuses a read-only organization", async () => {
    const { client } = fakeSupabase({ writable: false });
    expect(await resolveChannelContext(client, integration)).toEqual({ ok: false, reason: "read_only" });
  });
});
