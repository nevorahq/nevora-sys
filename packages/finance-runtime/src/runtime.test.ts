import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceRequestContext, FinanceServiceClaims } from "@nevora/finance-api";
import { createFinanceRuntimeApplication } from "./application";
import { resolveFinanceRuntimeContext } from "./context";
import { createMoneyAccount } from "./mutations";
import { findActiveMoneyAccountsByCurrency } from "./queries";

const context: FinanceRequestContext = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  actorId: "33333333-3333-4333-8333-333333333333",
  permissions: ["org.read", "data.write"],
};

describe("Finance Supabase runtime", () => {
  it("scopes reads to the bound organization", async () => {
    const eq = vi.fn(() => ({ eq, order: vi.fn(async () => ({ data: [], error: null })) }));
    const select = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;
    const application = createFinanceRuntimeApplication({ supabase, context });

    await application.getAccounts();
    expect(eq).toHaveBeenCalledWith("organization_id", context.organizationId);
  });

  describe("findActiveMoneyAccountsByCurrency", () => {
    it("distinguishes a genuine lookup failure from zero accounts", async () => {
      const chain = {
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        order: vi.fn(async () => ({ data: null, error: { message: "connection reset" } })),
      };
      const supabase = { from: vi.fn(() => ({ select: vi.fn(() => chain) })) } as unknown as SupabaseClient;

      const result = await findActiveMoneyAccountsByCurrency(supabase, context.organizationId, "USD");
      expect(result).toEqual({ ok: false, error: "connection reset" });
    });

    it("reports ok:true with an empty list when there genuinely are none", async () => {
      const chain = {
        eq: vi.fn(() => chain),
        is: vi.fn(() => chain),
        order: vi.fn(async () => ({ data: [], error: null })),
      };
      const supabase = { from: vi.fn(() => ({ select: vi.fn(() => chain) })) } as unknown as SupabaseClient;

      const result = await findActiveMoneyAccountsByCurrency(supabase, context.organizationId, "USD");
      expect(result).toEqual({ ok: true, accounts: [] });
    });
  });

  describe("createMoneyAccount", () => {
    const input = { name: "Cash", type: "cash" as const, initialBalance: 0, currency: "USD", creationRequestId: "44444444-4444-4444-8444-444444444444" };

    it("attributes the insert to the bound context", async () => {
      const insertChain = {
        select: vi.fn(() => insertChain),
        single: vi.fn(async () => ({ data: { id: "acc-1", name: "Cash", currency: "USD" }, error: null })),
      };
      const insert = vi.fn(() => insertChain);
      const supabase = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient;

      const result = await createMoneyAccount(supabase, context, input);

      expect(result).toEqual({ ok: true, account: { id: "acc-1", name: "Cash", currency: "USD" }, created: true });
      expect(insert).toHaveBeenCalledWith(expect.objectContaining({
        organization_id: context.organizationId,
        workspace_id: context.workspaceId,
        created_by: context.actorId,
      }));
    });

    it("is idempotent on a repeated creationRequestId (23505 resolves to the existing account)", async () => {
      const existing = { id: "acc-existing", name: "Cash", currency: "USD" };
      const insertChain = {
        select: vi.fn(() => insertChain),
        single: vi.fn(async () => ({ data: null, error: { code: "23505", message: "duplicate" } })),
      };
      const lookupChain = {
        eq: vi.fn(() => lookupChain),
        is: vi.fn(() => lookupChain),
        maybeSingle: vi.fn(async () => ({ data: existing, error: null })),
      };
      const supabase = {
        from: vi.fn(() => ({
          insert: vi.fn(() => insertChain),
          select: vi.fn(() => lookupChain),
        })),
      } as unknown as SupabaseClient;

      const result = await createMoneyAccount(supabase, context, input);
      expect(result).toEqual({ ok: true, account: existing, created: false });
    });

    it("does not resolve a 23505 conflict to an account in a different currency", async () => {
      const wrongCurrency = { id: "acc-eur", name: "Cash", currency: "EUR" };
      const insertChain = {
        select: vi.fn(() => insertChain),
        single: vi.fn(async () => ({ data: null, error: { code: "23505", message: "duplicate" } })),
      };
      const lookupChain = {
        eq: vi.fn(() => lookupChain),
        is: vi.fn(() => lookupChain),
        maybeSingle: vi.fn(async () => ({ data: wrongCurrency, error: null })),
      };
      const supabase = {
        from: vi.fn(() => ({
          insert: vi.fn(() => insertChain),
          select: vi.fn(() => lookupChain),
        })),
      } as unknown as SupabaseClient;

      const result = await createMoneyAccount(supabase, context, input);
      expect(result.ok).toBe(false);
    });
  });

  it("intersects signed permissions with the actor's live role", async () => {
    const claims: FinanceServiceClaims = {
      version: 1,
      issuer: "nevora-platform",
      audience: "nevora-finance",
      subject: context.actorId,
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      permissions: ["org.read", "data.write"],
      operation: "getAccounts",
      issuedAt: 1_800_000_000,
      expiresAt: 1_800_000_060,
      nonce: "55555555-5555-4555-8555-555555555555",
    };
    const rows: Record<string, Record<string, unknown> | null> = {
      organizations: { id: context.organizationId },
      workspaces: { id: context.workspaceId },
      memberships: { id: "membership-1", role: "member" },
    };
    const supabase = {
      from: vi.fn((table: string) => {
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        builder.maybeSingle = vi.fn(async () => ({ data: rows[table], error: null }));
        return builder;
      }),
    } as unknown as SupabaseClient;

    await expect(resolveFinanceRuntimeContext(supabase, claims)).resolves.toEqual(context);

    rows.memberships = { id: "membership-2", role: "read_only" };
    await expect(resolveFinanceRuntimeContext(supabase, claims)).resolves.toMatchObject({
      permissions: [],
    });
  });
});
