import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubscriptionsRequestContext, SubscriptionsServiceClaims } from "@nevora/subscriptions-api";
import type { SubscriptionForPayment, SubscriptionPaymentCycle } from "@nevora/subscriptions-contracts";
import { createSubscriptionsRuntimeApplication } from "./application";
import { resolveSubscriptionsRuntimeContext } from "./context";
import { createSubscriptionPaymentCycle, createSubscriptionPaymentTaskForCycle } from "./mutations";
import type { SubscriptionsRuntimeEffects } from "./effects";

const context: SubscriptionsRequestContext = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  actorId: "33333333-3333-4333-8333-333333333333",
  permissions: ["org.read", "data.write"],
};

const subscription: SubscriptionForPayment = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Figma",
  amount: 15,
  currency: "USD",
  billing_cycle: "monthly",
  billing_anchor_day: 15,
  next_billing_date: "2026-07-15",
  default_category_id: null,
  auto_task_enabled: true,
  is_active: true,
  cancelled_at: null,
  workspace_id: null,
};

function makeEffects(overrides: Partial<SubscriptionsRuntimeEffects> = {}): SubscriptionsRuntimeEffects {
  return {
    createGeneratedTask: vi.fn(async () => ({ ok: true as const, taskId: "task-1" })),
    emitDomainEvent: vi.fn(async () => undefined),
    emitAuditLog: vi.fn(async () => undefined),
    linkSubscriptionToTask: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("Subscriptions Supabase runtime", () => {
  it("scopes reads to the bound organization", async () => {
    const eq = vi.fn(() => ({ eq, order: vi.fn(async () => ({ data: [], error: null })) }));
    const select = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;
    const application = createSubscriptionsRuntimeApplication({
      supabase,
      context,
      effects: makeEffects(),
    });

    await application.getSubscriptions();
    expect(eq).toHaveBeenCalledWith("organization_id", context.organizationId);
  });

  describe("createSubscriptionPaymentCycle", () => {
    it("is idempotent on a duplicate billing period (23505 resolves to the existing cycle)", async () => {
      const existingCycle = { id: "cycle-existing", billing_period_key: "2026-07" };
      const insertChain = {
        select: vi.fn(() => insertChain),
        single: vi.fn(async () => ({ data: null, error: { code: "23505", message: "duplicate" } })),
      };
      const byKeyChain = {
        eq: vi.fn(() => byKeyChain),
        maybeSingle: vi.fn(async () => ({ data: existingCycle, error: null })),
      };
      const supabase = {
        from: vi.fn(() => ({
          insert: vi.fn(() => insertChain),
          select: vi.fn(() => byKeyChain),
        })),
      } as unknown as SupabaseClient;
      const effects = makeEffects();

      const result = await createSubscriptionPaymentCycle(supabase, context, effects, {
        subscription,
        dueDate: "2026-07-15",
      });

      expect(result).toEqual({ ok: true, cycle: existingCycle, created: false });
      // No duplicate cycle written and no event emitted for a resolve-to-existing outcome.
      expect(effects.emitDomainEvent).not.toHaveBeenCalled();
    });

    it("creates a new cycle and emits domain event + audit log", async () => {
      const newCycle: Partial<SubscriptionPaymentCycle> = { id: "cycle-new", billing_period_key: "2026-07" };
      const insertChain = {
        select: vi.fn(() => insertChain),
        single: vi.fn(async () => ({ data: newCycle, error: null })),
      };
      const supabase = {
        from: vi.fn(() => ({ insert: vi.fn(() => insertChain) })),
      } as unknown as SupabaseClient;
      const effects = makeEffects();

      const result = await createSubscriptionPaymentCycle(supabase, context, effects, {
        subscription,
        dueDate: "2026-07-15",
      });

      expect(result).toEqual({ ok: true, cycle: newCycle, created: true });
      expect(effects.emitDomainEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: "subscription.payment_cycle.created" }),
      );
      expect(effects.emitAuditLog).toHaveBeenCalledOnce();
    });
  });

  describe("createSubscriptionPaymentTaskForCycle", () => {
    const openCycle: SubscriptionPaymentCycle = {
      id: "cycle-1",
      organization_id: context.organizationId,
      workspace_id: null,
      subscription_id: subscription.id,
      period_start: "2026-07-15",
      period_end: "2026-08-14",
      due_date: "2026-08-15",
      billing_period_key: "2026-08",
      expected_amount: 15,
      currency: "USD",
      status: "planned",
      task_id: null,
      transaction_id: null,
      document_id: null,
      idempotency_key: "subscription:44444444-4444-4444-8444-444444444444:cycle:2026-08",
      created_by: null,
      created_at: "2026-07-15T00:00:00.000Z",
      updated_at: "2026-07-15T00:00:00.000Z",
      paid_at: null,
      skipped_at: null,
      cancelled_at: null,
    };

    it("is a no-op when auto_task_enabled is off", async () => {
      const effects = makeEffects();
      const supabase = { from: vi.fn() } as unknown as SupabaseClient;
      const result = await createSubscriptionPaymentTaskForCycle(supabase, context, effects, {
        subscription: { ...subscription, auto_task_enabled: false },
        cycle: openCycle,
      });
      expect(result).toEqual({ ok: true, taskId: "", created: false });
      expect(effects.createGeneratedTask).not.toHaveBeenCalled();
    });

    it("is a no-op when the cycle already has a task (never double-attaches)", async () => {
      const effects = makeEffects();
      const supabase = { from: vi.fn() } as unknown as SupabaseClient;
      const result = await createSubscriptionPaymentTaskForCycle(supabase, context, effects, {
        subscription,
        cycle: { ...openCycle, task_id: "existing-task" },
      });
      expect(result).toEqual({ ok: true, taskId: "existing-task", created: false });
      expect(effects.createGeneratedTask).not.toHaveBeenCalled();
    });

    it("is a no-op when the cycle is no longer planned", async () => {
      const effects = makeEffects();
      const supabase = { from: vi.fn() } as unknown as SupabaseClient;
      const result = await createSubscriptionPaymentTaskForCycle(supabase, context, effects, {
        subscription,
        cycle: { ...openCycle, status: "cancelled" },
      });
      expect(result).toEqual({ ok: true, taskId: "", created: false });
      expect(effects.createGeneratedTask).not.toHaveBeenCalled();
    });

    it("never reports success if the task effect fails", async () => {
      const effects = makeEffects({
        createGeneratedTask: vi.fn(async () => ({ ok: false as const, error: "boom" })),
      });
      const supabase = { from: vi.fn() } as unknown as SupabaseClient;
      const result = await createSubscriptionPaymentTaskForCycle(supabase, context, effects, {
        subscription,
        cycle: openCycle,
      });
      expect(result).toEqual({ ok: false, error: "Failed to create payment task" });
    });

    it("fails closed when the row-lock promote loses a concurrent race, even though a task was created", async () => {
      // A lost race (another writer already attached a task_id) means the guarded
      // update's `.is("task_id", null)` matches nothing — `promoted` comes back
      // null. This must NOT be reported as success: the caller created an orphan
      // task the safety cron can adopt, but must not claim this cycle "done".
      const updateChain = {
        eq: vi.fn(() => updateChain),
        is: vi.fn(() => updateChain),
        select: vi.fn(() => updateChain),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      };
      const supabase = {
        from: vi.fn(() => ({ update: vi.fn(() => updateChain) })),
      } as unknown as SupabaseClient;
      const effects = makeEffects();

      const result = await createSubscriptionPaymentTaskForCycle(supabase, context, effects, {
        subscription,
        cycle: openCycle,
      });

      expect(result).toEqual({ ok: false, error: "Failed to attach payment task to cycle" });
      // The task WAS created (effect already ran) — this asserts the runtime
      // never silently loses that task, only that it refuses to claim the cycle
      // was successfully promoted.
      expect(effects.createGeneratedTask).toHaveBeenCalledOnce();
      expect(effects.linkSubscriptionToTask).not.toHaveBeenCalled();
      expect(effects.emitDomainEvent).not.toHaveBeenCalled();
    });

    it("promotes the cycle and links the task on success", async () => {
      const updateChain = {
        eq: vi.fn(() => updateChain),
        is: vi.fn(() => updateChain),
        select: vi.fn(() => updateChain),
        maybeSingle: vi.fn(async () => ({ data: { id: openCycle.id }, error: null })),
      };
      const supabase = {
        from: vi.fn(() => ({ update: vi.fn(() => updateChain) })),
      } as unknown as SupabaseClient;
      const effects = makeEffects();

      const result = await createSubscriptionPaymentTaskForCycle(supabase, context, effects, {
        subscription,
        cycle: openCycle,
      });

      expect(result).toEqual({ ok: true, taskId: "task-1", created: true });
      expect(effects.linkSubscriptionToTask).toHaveBeenCalledWith({
        subscriptionId: subscription.id,
        taskId: "task-1",
        cycleId: openCycle.id,
      });
      expect(effects.emitDomainEvent).toHaveBeenCalledTimes(2);
      expect(effects.emitAuditLog).toHaveBeenCalledOnce();
    });
  });

  it("intersects signed permissions with the actor's live role", async () => {
    const claims: SubscriptionsServiceClaims = {
      version: 1,
      issuer: "nevora-platform",
      audience: "nevora-subscriptions",
      subject: context.actorId,
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      permissions: ["org.read", "data.write"],
      operation: "getSubscriptions",
      issuedAt: 1_800_000_000,
      expiresAt: 1_800_000_060,
      nonce: "55555555-5555-4555-8555-555555555555",
    };
    const rows: Record<string, Record<string, unknown> | null> = {
      organizations: { id: context.organizationId },
      workspaces: { id: context.workspaceId },
      memberships: { id: "membership-1", role: "member" },
    };
    const supabase = {
      from: vi.fn((table: string) => {
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        builder.maybeSingle = vi.fn(async () => ({ data: rows[table], error: null }));
        return builder;
      }),
    } as unknown as SupabaseClient;

    await expect(resolveSubscriptionsRuntimeContext(supabase, claims)).resolves.toEqual(context);

    rows.memberships = { id: "membership-2", role: "read_only" };
    await expect(resolveSubscriptionsRuntimeContext(supabase, claims)).resolves.toMatchObject({
      permissions: [],
    });
  });
});
