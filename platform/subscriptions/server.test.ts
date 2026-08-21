import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentContext } from "@/lib/context/current-context";

const requestHeaders = vi.fn(async () => new Headers({
  cookie: "sb-session=secret",
  host: "app.example.test",
  "x-forwarded-proto": "https",
}));

vi.mock("next/headers", () => ({ headers: requestHeaders }));
vi.mock("next/server", () => ({ after: vi.fn() }));

const getSubscriptions = vi.fn();
const getPaymentCycleByTaskId = vi.fn();
const getPaymentCycleByTransactionId = vi.fn();
const createSubscriptionPaymentCycle = vi.fn();
const createSubscriptionPaymentTaskForCycle = vi.fn();

vi.mock("@/modules/subtracker/server", () => ({
  getSubscriptions,
  getPaymentCycleByTaskId,
  getPaymentCycleByTransactionId,
  createSubscriptionPaymentCycle,
  createSubscriptionPaymentTaskForCycle,
}));

const {
  createInProcessSubscriptionsApplication,
  getSubscriptionsApplication,
  resolveSubscriptionsShadowReadPercent,
  resolveSubscriptionsTransportMode,
} = await import("./server");

const currentContext = {
  org: { id: "org-1" },
  workspace: { id: "workspace-1" },
  user: { id: "user-1" },
  permissions: new Set(["data.read", "data.write"]),
} as unknown as CurrentContext;
const supabase = { marker: "client" } as never;

const previousTransport = process.env.SUBSCRIPTIONS_TRANSPORT;
const previousApiUrl = process.env.SUBSCRIPTIONS_API_URL;
const previousServiceSecret = process.env.SUBSCRIPTIONS_SERVICE_AUTH_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SUBSCRIPTIONS_TRANSPORT;
  delete process.env.SUBSCRIPTIONS_API_URL;
  delete process.env.SUBSCRIPTIONS_SERVICE_AUTH_SECRET;
});

afterAll(() => {
  if (previousTransport === undefined) delete process.env.SUBSCRIPTIONS_TRANSPORT;
  else process.env.SUBSCRIPTIONS_TRANSPORT = previousTransport;
  if (previousApiUrl === undefined) delete process.env.SUBSCRIPTIONS_API_URL;
  else process.env.SUBSCRIPTIONS_API_URL = previousApiUrl;
  if (previousServiceSecret === undefined) delete process.env.SUBSCRIPTIONS_SERVICE_AUTH_SECRET;
  else process.env.SUBSCRIPTIONS_SERVICE_AUTH_SECRET = previousServiceSecret;
});

describe("createInProcessSubscriptionsApplication", () => {
  it("binds trusted tenant identity once", () => {
    const application = createInProcessSubscriptionsApplication({ supabase, currentContext });

    expect(application.context).toEqual({
      organizationId: "org-1",
      workspaceId: "workspace-1",
      actorId: "user-1",
      permissions: ["data.read", "data.write"],
    });
    expect(Object.isFrozen(application.context)).toBe(true);
  });

  it("pins reads to the authenticated organization", async () => {
    const application = createInProcessSubscriptionsApplication({ supabase, currentContext });
    await application.getSubscriptions();
    await application.getPaymentCycleByTaskId("task-1");
    await application.getPaymentCycleByTransactionId("transaction-1");

    expect(getSubscriptions).toHaveBeenCalledWith("org-1");
    expect(getPaymentCycleByTaskId).toHaveBeenCalledWith("org-1", "task-1");
    expect(getPaymentCycleByTransactionId).toHaveBeenCalledWith("org-1", "transaction-1");
  });

  it("injects infrastructure into mutations without exposing it in the port", async () => {
    const application = createInProcessSubscriptionsApplication({ supabase, currentContext });
    const cycleInput = { subscription: { id: "sub-1" }, dueDate: "2026-08-15" };
    const taskInput = { subscription: { id: "sub-1" }, cycle: { id: "cycle-1" } };

    await application.createSubscriptionPaymentCycle(cycleInput as never);
    expect(createSubscriptionPaymentCycle).toHaveBeenCalledWith({
      supabase,
      ctx: currentContext,
      ...cycleInput,
    });

    await application.createSubscriptionPaymentTaskForCycle(taskInput as never);
    expect(createSubscriptionPaymentTaskForCycle).toHaveBeenCalledWith({
      supabase,
      ctx: currentContext,
      ...taskInput,
    });
  });
});

describe("Subscriptions transport selection", () => {
  it("keeps in-process as the safe default", async () => {
    const application = await getSubscriptionsApplication({ supabase, currentContext });
    await application.getSubscriptions();

    expect(getSubscriptions).toHaveBeenCalledWith("org-1");
    expect(requestHeaders).not.toHaveBeenCalled();
  });

  it("constructs the HTTP adapter only when explicitly enabled", async () => {
    process.env.SUBSCRIPTIONS_TRANSPORT = "http";
    process.env.SUBSCRIPTIONS_API_URL = "https://subscriptions.example.test";
    process.env.SUBSCRIPTIONS_SERVICE_AUTH_SECRET = "a-secure-subscriptions-service-secret-1";

    const application = await getSubscriptionsApplication({ supabase, currentContext });

    expect(application.context.organizationId).toBe("org-1");
    expect(requestHeaders).toHaveBeenCalledTimes(1);
  });

  it("allows a service-token transport when no session cookie exists", async () => {
    process.env.SUBSCRIPTIONS_TRANSPORT = "http";
    process.env.SUBSCRIPTIONS_API_URL = "https://subscriptions.example.test";
    process.env.SUBSCRIPTIONS_SERVICE_AUTH_SECRET = "a-secure-subscriptions-service-secret-1";
    requestHeaders.mockResolvedValueOnce(new Headers({ host: "app.example.test" }));

    await expect(getSubscriptionsApplication({ supabase, currentContext })).resolves.toMatchObject({
      context: { organizationId: "org-1" },
    });
  });

  it("fails closed when the independent runtime signing secret is missing", async () => {
    process.env.SUBSCRIPTIONS_TRANSPORT = "http";
    process.env.SUBSCRIPTIONS_API_URL = "https://subscriptions.example.test";

    await expect(getSubscriptionsApplication({ supabase, currentContext })).rejects.toThrow(
      "SUBSCRIPTIONS_SERVICE_AUTH_SECRET",
    );
  });

  it("fails closed on an unsupported transport value", () => {
    expect(() => resolveSubscriptionsTransportMode("direct-db")).toThrow(
      "Unsupported SUBSCRIPTIONS_TRANSPORT value",
    );
  });

  it("supports the staged shadow and remote-read modes", () => {
    expect(resolveSubscriptionsTransportMode("shadow")).toBe("shadow");
    expect(resolveSubscriptionsTransportMode("http-read")).toBe("http-read");
    expect(resolveSubscriptionsTransportMode("http")).toBe("http");
  });

  it("validates the shadow sampling percentage", () => {
    expect(resolveSubscriptionsShadowReadPercent(undefined)).toBe(100);
    expect(resolveSubscriptionsShadowReadPercent("10")).toBe(10);
    expect(() => resolveSubscriptionsShadowReadPercent("101")).toThrow("between 0 and 100");
  });
});
