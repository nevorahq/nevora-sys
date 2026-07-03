import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertApiKeyScope,
  validateDeveloperApiKey,
} from "./api-key-service";
import {
  developerApiKeyPrefix,
  generateDeveloperApiKey,
  hashDeveloperApiKey,
  timingSafeEqualString,
} from "./api-key-crypto";

const rpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc })),
}));

describe("developer API key service", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("generates prefixed keys and hashes without storing raw secrets", () => {
    const key = generateDeveloperApiKey("live");
    expect(key).toMatch(/^nva_live_/);
    expect(developerApiKeyPrefix(key)).toBe(key.slice(0, 18));
    expect(hashDeveloperApiKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDeveloperApiKey(key)).not.toContain(key);
  });

  it("uses constant-time string comparison for equal hashes", () => {
    const hash = hashDeveloperApiKey("nva_live_test");
    expect(timingSafeEqualString(hash, hash)).toBe(true);
    expect(timingSafeEqualString(hash, hashDeveloperApiKey("other"))).toBe(false);
  });

  it("validates API key scopes", () => {
    expect(() => assertApiKeyScope({ scopes: ["tasks:read"] }, "tasks:read")).not.toThrow();
    expect(() => assertApiKeyScope({ scopes: ["tasks:read"] }, "tasks:write")).toThrow("missing_api_scope");
  });

  it("rejects invalid, revoked, or expired API keys when validation RPC returns no row", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(validateDeveloperApiKey("not-a-nevora-key")).resolves.toBeNull();
    await expect(validateDeveloperApiKey("nva_live_revoked")).resolves.toBeNull();
  });

  it("returns scoped auth context for valid API keys", async () => {
    rpc.mockResolvedValue({
      data: [{
        api_key_id: "key-1",
        organization_id: "org-1",
        organization_name: "Acme",
        organization_slug: "acme",
        plan_code: "pro",
        scopes: ["tasks:read"],
        rejection_reason: null,
      }],
      error: null,
    });

    await expect(validateDeveloperApiKey("nva_live_valid")).resolves.toMatchObject({
      apiKeyId: "key-1",
      organizationId: "org-1",
      scopes: ["tasks:read"],
    });
  });

  it("returns safe rejection status for known keys blocked by plan entitlements", async () => {
    rpc.mockResolvedValue({
      data: [{
        api_key_id: "key-start",
        organization_id: "org-start",
        organization_name: "Start org",
        organization_slug: "start-org",
        plan_code: "start",
        scopes: ["tasks:read"],
        rejection_reason: "developer_access_required",
      }],
      error: null,
    });

    await expect(validateDeveloperApiKey("nva_live_start")).resolves.toMatchObject({
      apiKeyId: "key-start",
      planCode: "start",
      rejectionReason: "developer_access_required",
    });
  });
});
