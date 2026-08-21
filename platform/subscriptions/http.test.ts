import { describe, expect, it, vi } from "vitest";
import {
  SUBSCRIPTIONS_HTTP_TRANSPORT_HEADER,
  SUBSCRIPTIONS_HTTP_TRANSPORT_VERSION,
} from "@nevora/subscriptions-api";
import { createHttpSubscriptionsApplication, SubscriptionsTransportError } from "./http";

const context = Object.freeze({
  organizationId: "org-1",
  workspaceId: "workspace-1",
  actorId: "user-1",
  permissions: ["data.read"],
});

describe("createHttpSubscriptionsApplication", () => {
  it("sends only operation input and forwards the authenticated session", async () => {
    const fetchImplementation = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ ok: true, data: { id: "cycle-1" } }),
    );
    const application = createHttpSubscriptionsApplication({
      baseUrl: "https://subscriptions.example.test",
      cookieHeader: "sb-session=secret",
      context,
      fetchImplementation,
    });

    await application.getPaymentCycleByTaskId("11111111-1111-4111-8111-111111111111");

    const [url, init] = fetchImplementation.mock.calls[0];
    expect(String(url)).toBe("https://subscriptions.example.test/api/internal/subscriptions");
    expect(init?.headers).toMatchObject({
      cookie: "sb-session=secret",
      [SUBSCRIPTIONS_HTTP_TRANSPORT_HEADER]: SUBSCRIPTIONS_HTTP_TRANSPORT_VERSION,
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      operation: "getPaymentCycleByTaskId",
      input: { taskId: "11111111-1111-4111-8111-111111111111" },
    });
    expect(String(init?.body)).not.toContain("organizationId");
    expect(String(init?.body)).not.toContain("workspaceId");
  });

  it("maps transport failures to a stable error", async () => {
    const application = createHttpSubscriptionsApplication({
      baseUrl: "https://subscriptions.example.test",
      cookieHeader: "sb-session=secret",
      context,
      fetchImplementation: vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ ok: false, error: "Forbidden", code: "PERMISSION_DENIED" }, { status: 403 }),
      ),
    });

    await expect(application.getSubscriptions()).rejects.toEqual(
      expect.objectContaining<SubscriptionsTransportError>({
        name: "SubscriptionsTransportError",
        message: "Forbidden",
        status: 403,
      }),
    );
  });

  it("uses an operation-bound bearer token when no session exists", async () => {
    const fetchImplementation = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ ok: true, data: [] }),
    );
    const serviceTokenFactory = vi.fn(() => "nss1.payload.signature");
    const application = createHttpSubscriptionsApplication({
      baseUrl: "https://subscriptions.example.test",
      serviceTokenFactory,
      context,
      fetchImplementation,
    });
    await application.getSubscriptions();

    expect(serviceTokenFactory).toHaveBeenCalledWith({ operation: "getSubscriptions", input: {} });
    const init = fetchImplementation.mock.calls[0][1];
    expect(init?.headers).toMatchObject({ authorization: "Bearer nss1.payload.signature" });
    expect(init?.headers).not.toHaveProperty("cookie");
  });
});
