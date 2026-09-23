import { describe, expect, it } from "vitest";
import {
  parseProductContext,
  PRODUCT_CONTEXT_COOKIE,
  productContextCookie,
} from "./product-context";

describe("product navigation context", () => {
  it("accepts only a known product", () => {
    expect(parseProductContext("subscriptions")).toBe("subscriptions");
    expect(parseProductContext("documents")).toBeUndefined();
    expect(parseProductContext(undefined)).toBeUndefined();
  });

  it("builds a scoped preference cookie and a matching clear cookie", () => {
    expect(productContextCookie("subscriptions")).toContain(
      `${PRODUCT_CONTEXT_COOKIE}=subscriptions`,
    );
    expect(productContextCookie(undefined)).toContain("Max-Age=0");
  });
});
