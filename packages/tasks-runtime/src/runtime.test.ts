import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TasksRequestContext, TasksServiceClaims } from "@nevora/tasks-api";
import { createTasksRuntimeApplication } from "./application";
import { getTask } from "./queries";
import { resolveTasksRuntimeContext } from "./context";
import type { TasksRuntimeEffects } from "./effects";

const context: TasksRequestContext = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  actorId: "33333333-3333-4333-8333-333333333333",
  permissions: ["org.read", "data.write"],
};

const effects: TasksRuntimeEffects = {
  reserveTaskUsage: vi.fn(async () => undefined),
  releaseTaskUsage: vi.fn(async () => undefined),
  emitDomainEvent: vi.fn(async () => undefined),
  emitAuditLog: vi.fn(async () => undefined),
  createDocumentTaskLink: vi.fn(async () => undefined),
};

describe("Tasks Supabase runtime", () => {
  it("attributes generated writes only from the bound context", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient;
    const application = createTasksRuntimeApplication({ supabase, context, effects });

    await expect(application.createGeneratedTask({
      title: "Pay invoice",
      dueDate: "2026-09-10",
      workspaceId: "99999999-9999-4999-8999-999999999999",
    })).resolves.toMatchObject({ ok: true });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: context.organizationId,
      workspace_id: context.workspaceId,
      created_by: context.actorId,
    }));
  });

  it("intersects signed permissions with the actor's live role", async () => {
    const claims: TasksServiceClaims = {
      version: 1,
      issuer: "nevora-platform",
      audience: "nevora-tasks",
      subject: context.actorId,
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      permissions: ["org.read", "data.write"],
      operation: "listTasks",
      issuedAt: 1_800_000_000,
      expiresAt: 1_800_000_060,
      nonce: "44444444-4444-4444-8444-444444444444",
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

    await expect(resolveTasksRuntimeContext(supabase, claims)).resolves.toEqual(context);

    rows.memberships = { id: "membership-2", role: "read_only" };
    await expect(resolveTasksRuntimeContext(supabase, claims)).resolves.toMatchObject({
      permissions: [],
    });
  });
});

describe("getTask detail read", () => {
  it("selects only live todo columns and names the task_relations foreign key", async () => {
    let selected = "";
    const chain = {
      select: vi.fn((columns: string) => {
        selected ||= columns;
        return chain;
      }),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      single: vi.fn(async () => ({ data: null, error: null })),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    const supabase = { from: vi.fn(() => chain) } as unknown as SupabaseClient;

    await getTask(supabase, context.organizationId, undefined, "44444444-4444-4444-8444-444444444444");

    // Migration 115 dropped the Financial Context columns; selecting any of
    // them fails with 42703 and silently drops the page to the base query.
    expect(selected).not.toMatch(/task_context_type|financial_|reminder_offset_days|provider_name|source_document_id/);
    // task_relations has two foreign keys to todos; an unnamed embed is PGRST201.
    expect(selected).toContain("task_relations!task_relations_task_id_fkey");
  });
});
