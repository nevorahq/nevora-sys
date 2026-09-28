import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import {
  consumeLinkCode,
  generateLinkCode,
  hashLinkCode,
  LINK_CODE_LENGTH,
  normalizeLinkCode,
} from "./link-codes";

describe("link codes", () => {
  it("generates unambiguous codes of the fixed length", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateLinkCode();
      expect(code).toHaveLength(LINK_CODE_LENGTH);
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]+$/);
    }
  });

  it("hashes a hand-typed code the same as the issued one", () => {
    expect(normalizeLinkCode(" abcd-2345 ")).toBe("ABCD2345");
    expect(hashLinkCode("abcd 2345")).toBe(hashLinkCode("ABCD2345"));
    expect(hashLinkCode("ABCD2345")).toMatch(/^[0-9a-f]{64}$/);
  });
});

type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, string, unknown]> };

function fakeSupabase(claimed: unknown) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    const builder: Record<string, unknown> = {};
    for (const op of ["update", "insert"]) {
      builder[op] = (payload: unknown) => {
        call.op = op;
        call.payload = payload;
        calls.push(call);
        return builder;
      };
    }
    for (const kind of ["eq", "is", "gt"]) {
      builder[kind] = (column: string, value: unknown) => {
        call.filters.push([kind, column, value]);
        return builder;
      };
    }
    builder.select = () => builder;
    builder.maybeSingle = async () => ({ data: claimed, error: null });
    builder.single = async () => ({ data: { id: "int-1", ...(call.payload as object) }, error: null });
    builder.then = (resolve: (value: unknown) => void) => resolve({ data: null, error: null });
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, calls };
}

const sender = { userId: "42", chatId: "42", username: "anna" };

describe("consumeLinkCode", () => {
  it("rejects a malformed code without touching the database", async () => {
    const { client, calls } = fakeSupabase(null);
    expect(await consumeLinkCode(client, "telegram", "0OIL1", sender)).toEqual({ ok: false, reason: "invalid" });
    expect(calls).toEqual([]);
  });

  it("claims an unused, unexpired code atomically and links the sender", async () => {
    const { client, calls } = fakeSupabase({ organization_id: "org-1", workspace_id: "ws-1", user_id: "user-1" });
    const result = await consumeLinkCode(client, "telegram", "abcd2345", sender);

    expect(result.ok).toBe(true);
    const claim = calls[0];
    expect(claim.table).toBe("channel_link_codes");
    expect(claim.filters).toEqual(
      expect.arrayContaining([
        ["eq", "code_hash", hashLinkCode("ABCD2345")],
        ["eq", "channel", "telegram"],
        ["is", "used_at", null],
      ]),
    );
    expect(claim.filters.some(([kind, column]) => kind === "gt" && column === "expires_at")).toBe(true);
    // Both unique slots are freed before the new link is written.
    expect(calls.slice(1, 3).map((c) => c.op)).toEqual(["update", "update"]);
    expect(calls[3]).toMatchObject({
      table: "channel_integrations",
      op: "insert",
      payload: expect.objectContaining({ organization_id: "org-1", user_id: "user-1", external_user_id: "42", status: "active" }),
    });
  });

  it("refuses a used, expired or unknown code", async () => {
    const { client, calls } = fakeSupabase(null);
    expect(await consumeLinkCode(client, "telegram", "ABCD2345", sender)).toEqual({ ok: false, reason: "invalid" });
    expect(calls).toHaveLength(1);
  });
});
