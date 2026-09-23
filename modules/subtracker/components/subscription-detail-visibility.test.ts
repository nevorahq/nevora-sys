import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const detailPage = readFileSync(
  join(ROOT, "app/(dashboard)/dashboard/subscriptions/[subscriptionId]/page.tsx"),
  "utf8",
);

describe("Subscription detail visibility", () => {
  it("keeps the payment workflow backend available without rendering its panel", () => {
    expect(detailPage).not.toContain("SubscriptionPaymentWorkflowPanel");
    expect(detailPage).not.toContain("getPaymentCyclesForSubscription");
  });
});
