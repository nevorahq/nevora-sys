import { describe, expect, it } from "vitest";
import { createPushPayload, pushPayloadSchema } from "./push-payload";

describe("push payload validation", () => {
  const valid = {
    title: "Payment review",
    body: "A planned payment needs attention.",
    tag: "payment:1",
    url: "/dashboard/actions",
    notificationId: "10000000-0000-4000-8000-000000000001",
  };

  it("accepts a bounded internal notification payload", () => {
    expect(createPushPayload(valid)).toEqual(valid);
  });

  it("rejects external target URLs and oversized bodies", () => {
    expect(pushPayloadSchema.safeParse({ ...valid, url: "https://example.com" }).success).toBe(false);
    expect(pushPayloadSchema.safeParse({ ...valid, body: "x".repeat(241) }).success).toBe(false);
  });
});
