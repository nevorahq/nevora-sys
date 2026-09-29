import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";

vi.mock("server-only", () => ({}));

import { learnProjectRuleFromAccept, matchProjectRule } from "./project-rules";

const ctx = { org: { id: "org-1" }, user: { id: "user-1" }, workspace: { id: "ws-1" } } as unknown as CurrentContext;
const ACME = "11111111-1111-4111-8111-111111111111";
const INTERNAL = "22222222-2222-4222-8222-222222222222";

type Call = { table: string; op: string; payload?: unknown; options?: unknown; filters: Array<[string, unknown]> };

function fakeSupabase(tables: { rules?: unknown[] | null; signals?: unknown; rulesError?: boolean }) {
  const calls: Call[] = [];
  const from = vi.fn((table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    const result = () => {
      if (table === "planner_entries") return { data: { channel_signals: tables.signals ?? {} }, error: null };
      if (tables.rulesError) return { data: null, error: { code: "42P01", message: "missing" } };
      return { data: call.op === "select" ? tables.rules ?? [] : null, error: null };
    };
    for (const op of ["update", "upsert", "delete"]) {
      builder[op] = (payload?: unknown, options?: unknown) => {
        call.op = op;
        call.payload = payload;
        call.options = options;
        return builder;
      };
    }
    builder.select = () => builder;
    builder.eq = (column: string, value: unknown) => {
      call.filters.push([column, value]);
      return builder;
    };
    builder.in = (column: string, value: unknown) => {
      call.filters.push([column, value]);
      return builder;
    };
    builder.maybeSingle = async () => result();
    (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return builder;
  });
  return { supabase: { from } as unknown as SupabaseClient, calls };
}

describe("matchProjectRule", () => {
  const signals = { email_sender: "bob@acme.com", email_domain: "acme.com" };

  it("prefers the most specific live rule, scopes the read to the user, and bumps its usage", async () => {
    const fake = fakeSupabase({
      rules: [
        { id: "r-domain", signal_type: "email_domain", signal_value: "acme.com", project_id: ACME, hits: 3 },
        { id: "r-sender", signal_type: "email_sender", signal_value: "bob@acme.com", project_id: INTERNAL, hits: 1 },
      ],
    });
    const rule = await matchProjectRule(fake.supabase, ctx, signals, new Set([ACME, INTERNAL]));
    expect(rule).toEqual({ ruleId: "r-sender", projectId: INTERNAL });
    expect(fake.calls[0].filters).toEqual(
      expect.arrayContaining([["organization_id", "org-1"], ["owner_user_id", "user-1"]]),
    );
    expect(fake.calls[1]).toMatchObject({ op: "update", payload: expect.objectContaining({ hits: 2 }) });
  });

  it("skips a rule whose project is no longer live", async () => {
    const fake = fakeSupabase({
      rules: [
        { id: "r-sender", signal_type: "email_sender", signal_value: "bob@acme.com", project_id: INTERNAL, hits: 1 },
        { id: "r-domain", signal_type: "email_domain", signal_value: "acme.com", project_id: ACME, hits: 3 },
      ],
    });
    expect(await matchProjectRule(fake.supabase, ctx, signals, new Set([ACME]))).toEqual({ ruleId: "r-domain", projectId: ACME });
  });

  it("means no rule without signals, without projects, or before migration 125", async () => {
    expect(await matchProjectRule(fakeSupabase({}).supabase, ctx, {}, new Set([ACME]))).toBeNull();
    expect(await matchProjectRule(fakeSupabase({}).supabase, ctx, signals, new Set())).toBeNull();
    expect(await matchProjectRule(fakeSupabase({ rulesError: true }).supabase, ctx, signals, new Set([ACME]))).toBeNull();
  });
});

describe("learnProjectRuleFromAccept", () => {
  it("upserts the source → project rule when the user changed the project", async () => {
    const fake = fakeSupabase({ signals: { slack_channel: "T1:C1", slack_channel_label: "#acme" } });
    await learnProjectRuleFromAccept(fake.supabase, ctx, {
      planner_entry_id: "entry-1",
      proposed_payload: { projectId: INTERNAL, suggestedProjectId: ACME, projectSource: "ai" },
    });
    const upsert = fake.calls.find((call) => call.op === "upsert")!;
    expect(upsert.payload).toEqual({
      organization_id: "org-1",
      owner_user_id: "user-1",
      signal_type: "slack_channel",
      signal_value: "T1:C1",
      signal_label: "#acme",
      project_id: INTERNAL,
    });
    expect(upsert.options).toEqual({ onConflict: "organization_id,owner_user_id,signal_type,signal_value" });
  });

  it("deletes the rule that proposed a project the user cleared", async () => {
    const fake = fakeSupabase({ signals: { slack_channel: "T1:C1" } });
    await learnProjectRuleFromAccept(fake.supabase, ctx, {
      planner_entry_id: "entry-1",
      proposed_payload: { suggestedProjectId: ACME, projectSource: "rule", projectRuleId: "r1" },
    });
    const del = fake.calls.find((call) => call.op === "delete")!;
    expect(del.filters).toEqual([["id", "r1"], ["organization_id", "org-1"], ["owner_user_id", "user-1"]]);
  });

  it("reads nothing when no project was proposed or chosen", async () => {
    const fake = fakeSupabase({});
    await learnProjectRuleFromAccept(fake.supabase, ctx, { planner_entry_id: "entry-1", proposed_payload: {} });
    expect(fake.calls).toHaveLength(0);
  });
});
