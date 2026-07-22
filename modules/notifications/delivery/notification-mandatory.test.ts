import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  service: null as unknown,
  sendNotification: vi.fn(),
}));

vi.mock("@/lib/supabase/service-role", () => ({ getServiceRoleClient: () => runtime.service }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { child: () => ({ info() {}, warn() {}, error() {} }) },
}));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: runtime.sendNotification,
  },
}));

/**
 * Mandatory-notification invariants (Sprint 3 §S3.3 follow-up).
 *
 * "Mandatory billing/security issues cannot be hidden by user notification
 * preferences." Two structural guarantees enforce it:
 *
 *   1. The durable in-app record is created for EVERY notification, before and
 *      independent of any category/quiet-hours preference — so nothing is ever
 *      hidden from the bell/history.
 *   2. A `mandatory` notification's PUSH additionally bypasses the category mute
 *      and quiet hours (the disruptive channel), while non-mandatory push still
 *      respects them.
 */

const ROOT = process.cwd();
const src = readFileSync(join(ROOT, "modules/notifications/delivery/notification-delivery.ts"), "utf8");

/** Body of `deliverNotification` up to where `deliverPush` is defined. */
const deliverBody = src.slice(
  src.indexOf("export async function deliverNotification"),
  src.indexOf("async function deliverPush"),
);
/** Body of `deliverPush`. */
const pushBody = src.slice(src.indexOf("async function deliverPush"));

function chain(result: unknown) {
  const value = {
    eq() { return value; },
    maybeSingle() { return Promise.resolve(result); },
    then(resolve: (resolved: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return value;
}

function makeDeliveryClient() {
  return {
    from(table: string) {
      if (table === "notifications") {
        return {
          insert() {
            return {
              select() {
                return { single: async () => ({ data: { id: "00000000-0000-4000-8000-000000000001" }, error: null }) };
              },
            };
          },
        };
      }
      return { insert: async () => ({ error: null }) };
    },
  };
}

function makeServiceClient(options: { browserEnabled: boolean; paymentEnabled: boolean }) {
  const preferences = {
    browser_notifications_enabled: options.browserEnabled,
    in_app_sound_enabled: false,
    sound_mode: "important",
    sound_volume: 0.7,
    quiet_hours_enabled: true,
    quiet_hours_start: "00:00",
    quiet_hours_end: "00:00",
    timezone: "UTC",
    task_reminders_enabled: true,
    subscription_reminders_enabled: true,
    payment_reminders_enabled: options.paymentEnabled,
    document_review_enabled: true,
    action_center_enabled: true,
  };

  return {
    from(table: string) {
      if (table === "memberships") {
        return { select: () => chain({ data: { id: "membership-1" }, error: null }) };
      }
      if (table === "user_notification_preferences") {
        return { select: () => chain({ data: preferences, error: null }) };
      }
      if (table === "push_subscriptions") {
        return {
          select: () => chain({
            data: [{ id: "push-1", endpoint: "https://push.example/1", p256dh: "key", auth_key: "auth" }],
            error: null,
          }),
          update: () => chain({ error: null }),
          delete: () => chain({ error: null }),
        };
      }
      throw new Error(`Unexpected service table: ${table}`);
    },
  };
}

async function deliver(options: {
  mandatory?: boolean;
  browserEnabled?: boolean;
  category?: "task" | "payment";
  paymentEnabled?: boolean;
  priority?: "normal" | "critical";
}) {
  runtime.service = makeServiceClient({
    browserEnabled: options.browserEnabled ?? true,
    paymentEnabled: options.paymentEnabled ?? false,
  });
  vi.resetModules();
  const { deliverNotification } = await import("./notification-delivery");
  return deliverNotification(makeDeliveryClient() as never, {
    organizationId: "org-1",
    userId: "user-1",
    title: "Billing issue",
    body: "Review billing",
    priority: options.priority ?? "critical",
    category: options.category ?? "payment",
    deduplicationKey: "billing:1",
    mandatory: options.mandatory,
  });
}

describe("mandatory notifications: durable record is never hidden by preferences", () => {
  it("deliverNotification always inserts the in-app record", () => {
    expect(deliverBody).toMatch(/\.from\(\s*["'`]notifications["'`]\s*\)\s*\.insert\(/);
  });

  it("the in-app insert is not gated by any category/quiet-hours preference", () => {
    expect(deliverBody).not.toContain("isCategoryEnabled");
    expect(deliverBody).not.toContain("isWithinQuietHours");
  });
});

describe("mandatory notifications: push bypasses the mute + quiet hours", () => {
  it("the input carries a mandatory flag", () => {
    expect(src).toMatch(/mandatory\?:\s*boolean/);
  });

  it("push guards the category mute and quiet hours behind !input.mandatory", () => {
    const guard = pushBody.indexOf("if (!isMandatoryNotification(input))");
    const category = pushBody.indexOf("isCategoryEnabled");
    const quiet = pushBody.indexOf("isWithinQuietHours");
    expect(guard).toBeGreaterThan(-1);
    expect(category).toBeGreaterThan(guard);
    expect(quiet).toBeGreaterThan(guard);
  });

  it("still respects the channel opt-in (browser push must be enabled)", () => {
    // Mandatory escalates within an enabled channel; it does not invent a channel
    // the user never opted into. The in-app record still carries it either way.
    expect(pushBody).toMatch(/browserNotificationsEnabled/);
  });
});

describe("mandatory notifications: runtime behavior", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public");
    vi.stubEnv("VAPID_PRIVATE_KEY", "private");
    vi.stubEnv("VAPID_SUBJECT", "mailto:ops@example.com");
    runtime.sendNotification.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  it("sends mandatory push despite a category mute and quiet hours", async () => {
    const results = await deliver({ mandatory: true });
    expect(results).toContainEqual(expect.objectContaining({ channel: "push", status: "sent" }));
    expect(runtime.sendNotification).toHaveBeenCalledOnce();
  });

  it("keeps ordinary push muted when its category is disabled", async () => {
    const results = await deliver({ mandatory: false, category: "payment", priority: "normal" });
    expect(results).toContainEqual(expect.objectContaining({
      channel: "push",
      status: "skipped",
      reason: "category_disabled",
    }));
    expect(runtime.sendNotification).not.toHaveBeenCalled();
  });

  it("keeps ordinary push muted during quiet hours", async () => {
    const results = await deliver({ mandatory: false, category: "payment", priority: "normal", paymentEnabled: true });
    expect(results).toContainEqual(expect.objectContaining({
      channel: "push",
      status: "skipped",
      reason: "quiet_hours",
    }));
    expect(runtime.sendNotification).not.toHaveBeenCalled();
  });

  it("still respects browser push opt-out for a mandatory notification", async () => {
    const results = await deliver({ mandatory: true, browserEnabled: false });
    expect(results).toContainEqual(expect.objectContaining({
      channel: "push",
      status: "skipped",
      reason: "disabled",
    }));
    expect(runtime.sendNotification).not.toHaveBeenCalled();
  });

  it("derives mandatory delivery for high/critical billing signals", async () => {
    const results = await deliver({ priority: "critical", paymentEnabled: false });
    expect(results).toContainEqual(expect.objectContaining({ channel: "push", status: "sent" }));
    expect(runtime.sendNotification).toHaveBeenCalledOnce();
  });
});
