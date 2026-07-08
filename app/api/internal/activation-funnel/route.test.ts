import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getActivationFunnel = vi.fn(async (_days?: number) => ({
  ok: true as const,
  windowDays: 30,
  funnel: { started: 1 },
}));

vi.mock("@/modules/onboarding/queries/get-activation-funnel", () => ({
  getActivationFunnel,
  DEFAULT_WINDOW_DAYS: 30,
}));
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

const { GET } = await import("./route");

const URL_BASE = "https://app.example.com/api/internal/activation-funnel";

function request(url = URL_BASE, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

const originalSecret = process.env.METRICS_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.METRICS_SECRET = "s3cret";
  getActivationFunnel.mockResolvedValue({ ok: true as const, windowDays: 30, funnel: { started: 1 } });
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.METRICS_SECRET;
  else process.env.METRICS_SECRET = originalSecret;
});

describe("GET /api/internal/activation-funnel", () => {
  it("refuses to answer when no secret is configured — fail closed, never open", async () => {
    delete process.env.METRICS_SECRET;

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(getActivationFunnel).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong bearer token", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request(URL_BASE, { authorization: "Bearer nope" }))).status).toBe(401);
    expect((await GET(request(URL_BASE, { authorization: "s3cret" }))).status).toBe(401);

    expect(getActivationFunnel).not.toHaveBeenCalled();
  });

  it("returns the funnel to an authorized caller", async () => {
    const response = await GET(request(URL_BASE, { authorization: "Bearer s3cret" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, windowDays: 30 });
    expect(getActivationFunnel).toHaveBeenCalledWith(30);
  });

  it("clamps the window instead of scanning an unbounded history", async () => {
    await GET(request(`${URL_BASE}?days=99999`, { authorization: "Bearer s3cret" }));
    expect(getActivationFunnel).toHaveBeenCalledWith(365);
  });

  it("falls back to the default window for nonsense input", async () => {
    for (const days of ["0", "-5", "abc", ""]) {
      vi.clearAllMocks();
      await GET(request(`${URL_BASE}?days=${days}`, { authorization: "Bearer s3cret" }));
      expect(getActivationFunnel).toHaveBeenCalledWith(30);
    }
  });

  it("reports 503 when the service role is missing, 500 when the read fails", async () => {
    getActivationFunnel.mockResolvedValue({ ok: false, error: "x", configured: false } as never);
    expect((await GET(request(URL_BASE, { authorization: "Bearer s3cret" }))).status).toBe(503);

    getActivationFunnel.mockResolvedValue({ ok: false, error: "x", configured: true } as never);
    expect((await GET(request(URL_BASE, { authorization: "Bearer s3cret" }))).status).toBe(500);
  });

  it("never leaks a stack trace when the query throws", async () => {
    getActivationFunnel.mockRejectedValue(new Error("connection to db-prod-7 refused"));

    const response = await GET(request(URL_BASE, { authorization: "Bearer s3cret" }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Could not read the funnel." });
  });
});
