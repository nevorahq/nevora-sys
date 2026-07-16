import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
const resolveExchangeRate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrg }));
vi.mock("../queries/resolve-exchange-rate", () => ({ resolveExchangeRate }));

const { resolveTransferRateAction } = await import("./resolve-transfer-rate.action");

const ORG = "11111111-1111-4111-8111-111111111111";
const FROM = "22222222-2222-4222-8222-222222222222";
const TO = "33333333-3333-4333-8333-333333333333";

function makeClient() {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.is = vi.fn(() => query);
  query.in = vi.fn(async () => ({
    data: [
      { id: FROM, currency: "EUR", is_active: true },
      { id: TO, currency: "USD", is_active: true },
    ],
    error: null,
  }));
  return { from: vi.fn(() => query) };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOrg.mockResolvedValue({ org: { id: ORG, baseCurrency: "MDL" } });
  createClient.mockResolvedValue(makeClient());
  resolveExchangeRate.mockImplementation(
    async (_organizationId: string, from: string, to: string) => {
      if (from === "EUR" && to === "USD") return { rate: 1.1514 };
      if (from === "MDL" && to === "EUR") return { rate: 0.0495049505 };
      if (from === "MDL" && to === "USD") return { rate: 0.057 };
      return null;
    },
  );
});

describe("resolveTransferRateAction", () => {
  it("returns familiar foreign-to-base legs for a transparent cross calculation", async () => {
    const result = await resolveTransferRateAction(FROM, TO, "2026-07-16");

    expect(result.baseCurrency).toBe("MDL");
    expect(result.sourceBaseRate).toBeCloseTo(20.2, 8);
    expect(result.destinationBaseRate).toBeCloseTo(17.5438596491, 8);
    expect(result.resolved?.rate).toBe(1.1514);
  });
});
