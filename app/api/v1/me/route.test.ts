import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedApiKey } from "@/modules/developer/types/developer.types";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  authenticateApiKeyRequest: vi.fn(),
  assertApiRateLimit: vi.fn(),
  trackApiUsage: vi.fn(),
}));

vi.mock("@/lib/api/developer-api", () => {
  return {
    authenticateApiKeyRequest: mocks.authenticateApiKeyRequest,
    assertApiRateLimit: mocks.assertApiRateLimit,
    trackApiUsage: mocks.trackApiUsage,
    unauthorizedApiResponse: () => Response.json({ error: "unauthorized" }, { status: 401 }),
    forbiddenApiResponse: (error = "forbidden") => Response.json({ error }, { status: 403 }),
    rateLimitedApiResponse: () => Response.json({ error: "api_rate_limited" }, { status: 429 }),
  };
});

function request(apiKey?: string) {
  return new NextRequest("https://nevora.test/api/v1/me", {
    headers: apiKey ? { authorization: `Bearer ${apiKey}` } : undefined,
  });
}

function rawRequest(authorization: string) {
  return new NextRequest("https://nevora.test/api/v1/me", {
    headers: { authorization },
  });
}

function auth(planCode: "start" | "pro" | "business"): AuthenticatedApiKey {
  return {
    apiKeyId: `key-${planCode}`,
    keyHash: `hash-${planCode}`,
    organizationId: `org-${planCode}`,
    organizationName: `${planCode} org`,
    organizationSlug: `${planCode}-org`,
    planCode,
    scopes: ["tasks:read"],
  };
}

describe("GET /api/v1/me", () => {
  beforeEach(() => {
    mocks.authenticateApiKeyRequest.mockReset();
    mocks.assertApiRateLimit.mockReset();
    mocks.trackApiUsage.mockReset();
  });

  it("rejects a missing API key", async () => {
    mocks.authenticateApiKeyRequest.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
  });

  it("rejects malformed API key authorization", async () => {
    mocks.authenticateApiKeyRequest.mockResolvedValue(null);
    const response = await GET(rawRequest("Basic not-a-bearer-token"));
    expect(response.status).toBe(401);
  });

  it("rejects unknown API keys", async () => {
    mocks.authenticateApiKeyRequest.mockResolvedValue(null);
    const response = await GET(request("nva_live_unknown"));
    expect(response.status).toBe(401);
  });

  it("rejects revoked API keys", async () => {
    mocks.authenticateApiKeyRequest.mockResolvedValue(null);
    const response = await GET(request("nva_live_revoked"));
    expect(response.status).toBe(401);
  });

  it("rejects expired API keys", async () => {
    mocks.authenticateApiKeyRequest.mockResolvedValue(null);
    const response = await GET(request("nva_live_expired"));
    expect(response.status).toBe(401);
  });

  it("forbids valid Start plan keys without developer access", async () => {
    mocks.authenticateApiKeyRequest.mockResolvedValue({
      ...auth("pro"),
      planCode: "start",
      rejectionReason: "developer_access_required",
    });
    const response = await GET(request("nva_live_start"));
    expect(response.status).toBe(403);
  });

  it("returns scoped identity for a valid Pro API key", async () => {
    mocks.authenticateApiKeyRequest.mockResolvedValue(auth("pro"));
    const response = await GET(request("nva_live_pro"));
    await expect(response.json()).resolves.toMatchObject({
      organization: { id: "org-pro" },
      plan: { code: "pro" },
      apiKey: { id: "key-pro", scopes: ["tasks:read"] },
    });
    expect(mocks.trackApiUsage).toHaveBeenCalledTimes(1);
  });

  it("returns scoped identity for a valid Business API key", async () => {
    mocks.authenticateApiKeyRequest.mockResolvedValue(auth("business"));
    const response = await GET(request("nva_live_business"));
    await expect(response.json()).resolves.toMatchObject({
      organization: { id: "org-business" },
      plan: { code: "business" },
    });
    expect(mocks.assertApiRateLimit).toHaveBeenCalledTimes(1);
  });

  it("returns 429 when authoritative usage tracking rejects the request", async () => {
    mocks.authenticateApiKeyRequest.mockResolvedValue(auth("pro"));
    mocks.trackApiUsage.mockRejectedValue(new Error("api_rate_limited"));
    const response = await GET(request("nva_live_pro"));
    expect(response.status).toBe(429);
  });
});
