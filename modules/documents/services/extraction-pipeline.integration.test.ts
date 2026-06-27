import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * DB-BACKED INTEGRATION TEST (the prod gate Codex asked for).
 *
 * Unit tests mock Supabase, so they cannot catch SCHEMA DRIFT (a column the app
 * writes that no longer exists — exactly what broke delete + needed migration
 * 052) or CHECK/constraint regressions. This test exercises the money-transaction
 * lifecycle against a REAL Postgres with all migrations applied.
 *
 * It is OPT-IN and skipped by default — it never runs in the normal `vitest`
 * pass and cannot touch a DB unless you wire one up:
 *
 *   RUN_DB_TESTS=1 \
 *   NEXT_PUBLIC_SUPABASE_URL=<url> \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   npx vitest run modules/documents/services/extraction-pipeline.integration.test.ts
 *
 * Point it at a LOCAL stack (`supabase start` → `supabase db reset`) or a
 * disposable test project — NOT production. It discovers an existing org +
 * active account to satisfy foreign keys, inserts a THROWAWAY draft, drives it
 * through the status lifecycle, and hard-deletes the throwaway row in afterAll.
 *
 * Scope note: this uses the service-role client (RLS-bypassing) to validate
 * SCHEMA + CHECK constraints + status transitions. Verifying RLS policies
 * themselves needs an authenticated (anon + signed-in user) client and is a
 * deeper follow-up.
 */

const ENABLED =
  process.env.RUN_DB_TESTS === "1" &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!ENABLED)("extraction pipeline — DB schema & lifecycle", () => {
  let db: SupabaseClient;
  let orgId: string;
  let workspaceId: string | null;
  let userId: string | null;
  let accountId: string;
  let accountCurrency: string;
  const createdTxIds: string[] = [];

  beforeAll(async () => {
    db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Discover an existing active account to satisfy FKs (org/workspace/account).
    const { data: account, error } = await db
      .from("money_accounts")
      .select("id, organization_id, currency, created_by, workspace_id")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`fixture discovery failed: ${error.message}`);
    if (!account) throw new Error("no active money account exists — seed one before running this test");

    accountId = account.id as string;
    orgId = account.organization_id as string;
    accountCurrency = account.currency as string;
    workspaceId = (account.workspace_id as string | null) ?? null;
    userId = (account.created_by as string | null) ?? null;
  });

  afterAll(async () => {
    if (createdTxIds.length) {
      await db.from("money_transactions").delete().in("id", createdTxIds);
    }
  });

  it("accepts every column the draft-creation path writes (catches schema drift)", async () => {
    const { data, error } = await db
      .from("money_transactions")
      .insert({
        organization_id: orgId,
        workspace_id: workspaceId,
        created_by: userId,
        updated_by: userId,
        account_id: accountId,
        type: "expense",
        amount: 12.34,
        currency: accountCurrency,
        transaction_date: new Date().toISOString().slice(0, 10),
        title: "[integration-test] throwaway draft",
        status: "planned",
        merchant_name: "Integration Test Co",
        confidence_score: 0.91,
        note: null,
      })
      .select("id, status")
      .single();

    expect(error).toBeNull();
    expect(data?.status).toBe("planned");
    if (data?.id) createdTxIds.push(data.id as string);
  });

  it("transitions planned → posted (confirm) on a same-currency account", async () => {
    const txId = createdTxIds[0];
    expect(txId).toBeTruthy();

    const { data, error } = await db
      .from("money_transactions")
      .update({ status: "posted", account_id: accountId, updated_by: userId })
      .eq("id", txId)
      .eq("status", "planned")
      .select("id, status")
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.status).toBe("posted");
  });

  it("rejects an out-of-range confidence_score (CHECK constraint holds)", async () => {
    const { error } = await db.from("money_transactions").insert({
      organization_id: orgId,
      workspace_id: workspaceId,
      created_by: userId,
      updated_by: userId,
      account_id: accountId,
      type: "expense",
      amount: 1,
      currency: accountCurrency,
      transaction_date: new Date().toISOString().slice(0, 10),
      title: "[integration-test] bad confidence",
      status: "planned",
      confidence_score: 9, // must be 0..1
    });

    expect(error).not.toBeNull();
  });
});
