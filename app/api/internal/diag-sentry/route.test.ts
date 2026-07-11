import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reportError = vi.fn(() => ({ diagnosticId: "abc123-deadbe", message: "ignored" }));

vi.mock("@/lib/observability/report-error", () => ({ reportError }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

const { GET } = await import("./route");

const URL_BASE = "https://app.example.com/api/internal/diag-sentry";

function request(url = URL_BASE, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

const originalSecret = process.env.METRICS_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.METRICS_SECRET = "s3cret";
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.METRICS_SECRET;
  else process.env.METRICS_SECRET = originalSecret;
});

describe("GET /api/internal/diag-sentry", () => {
  it("refuses when no secret is configured — fail closed, never open", async () => {
    delete process.env.METRICS_SECRET;

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong bearer token", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request(URL_BASE, { authorization: "Bearer nope" }))).status).toBe(401);
    expect((await GET(request(URL_BASE, { authorization: "s3cret" }))).status).toBe(401);

    expect(reportError).not.toHaveBeenCalled();
  });

  it("caught lane: reports through the seam and echoes the diagnosticId", async () => {
    const response = await GET(request(URL_BASE, { authorization: "Bearer s3cret" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      lane: "caught",
      event: "diag.sentry.smoke",
      diagnosticId: "abc123-deadbe",
    });
    expect(reportError).toHaveBeenCalledWith(
      "diag.sentry.smoke",
      expect.any(Error),
      expect.objectContaining({ fields: expect.objectContaining({ mode: "caught" }) }),
    );
  });

  it("throw lane: bubbles an uncaught error for onRequestError to capture", async () => {
    await expect(GET(request(`${URL_BASE}?mode=throw`, { authorization: "Bearer s3cret" }))).rejects.toThrow(
      /diag: Sentry deployed smoke \(throw\)/,
    );
    // Uncaught lane does not go through reportError — it reaches the seam via
    // instrumentation.ts onRequestError instead.
    expect(reportError).not.toHaveBeenCalled();
  });
});
