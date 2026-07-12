import { beforeEach, describe, expect, it, vi } from "vitest";

const getServiceRoleClient = vi.fn();
vi.mock("@/lib/supabase/service-role", () => ({ getServiceRoleClient }));

const { evaluateAccountDeletion } = await import("./account-deletion-guard");

interface Result {
  data: unknown;
  error: unknown;
}

/**
 * Fake supabase whose `.from(table)` returns a thenable builder resolving the
 * next queued response for that table (FIFO). Chainable select/eq/in are no-ops
 * that return the builder, matching the guard's query shape.
 */
function makeSupabase(queues: Record<string, Result[]>) {
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    for (const m of ["eq", "in"]) builder[m] = vi.fn(() => builder);
    const term = () =>
      Promise.resolve(
        queues[table]?.shift() ?? { data: [], error: null },
      );
    (builder as { then: unknown }).then = (
      res: (v: unknown) => unknown,
      rej: (e: unknown) => unknown,
    ) => term().then(res, rej);
    return builder;
  });
  return { from };
}

const USER = "user-1";

beforeEach(() => {
  getServiceRoleClient.mockReset();
});

describe("evaluateAccountDeletion", () => {
  it("classifies a solo org for cascade delete, does not block", async () => {
    getServiceRoleClient.mockReturnValue(
      makeSupabase({
        memberships: [
          // 1) user's active memberships
          { data: [{ organization_id: "org-solo", user_id: USER, role: "owner", status: "active" }], error: null },
          // 2) all active memberships of those orgs — only the user
          { data: [{ organization_id: "org-solo", user_id: USER, role: "owner", status: "active" }], error: null },
        ],
      }),
    );

    const result = await evaluateAccountDeletion(USER);
    expect(result.blocking).toHaveLength(0);
    expect(result.soloOrganizationIds).toEqual(["org-solo"]);
  });

  it("blocks when the user is the sole owner of a shared org", async () => {
    getServiceRoleClient.mockReturnValue(
      makeSupabase({
        memberships: [
          { data: [{ organization_id: "org-team", user_id: USER, role: "owner", status: "active" }], error: null },
          {
            data: [
              { organization_id: "org-team", user_id: USER, role: "owner", status: "active" },
              { organization_id: "org-team", user_id: "user-2", role: "member", status: "active" },
            ],
            error: null,
          },
        ],
        organizations: [{ data: [{ id: "org-team", name: "Acme" }], error: null }],
      }),
    );

    const result = await evaluateAccountDeletion(USER);
    expect(result.soloOrganizationIds).toHaveLength(0);
    expect(result.blocking).toEqual([
      { organizationId: "org-team", organizationName: "Acme", otherActiveMembers: 1 },
    ]);
  });

  it("does not block when a co-owner exists (membership just detaches)", async () => {
    getServiceRoleClient.mockReturnValue(
      makeSupabase({
        memberships: [
          { data: [{ organization_id: "org-team", user_id: USER, role: "owner", status: "active" }], error: null },
          {
            data: [
              { organization_id: "org-team", user_id: USER, role: "owner", status: "active" },
              { organization_id: "org-team", user_id: "user-2", role: "owner", status: "active" },
            ],
            error: null,
          },
        ],
      }),
    );

    const result = await evaluateAccountDeletion(USER);
    expect(result.blocking).toHaveLength(0);
    expect(result.soloOrganizationIds).toHaveLength(0);
  });

  it("throws when the service-role key is not configured", async () => {
    getServiceRoleClient.mockReturnValue(null);
    await expect(evaluateAccountDeletion(USER)).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
