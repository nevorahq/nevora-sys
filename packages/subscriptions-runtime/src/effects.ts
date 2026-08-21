export interface SubscriptionsDomainEvent {
  eventName: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

export interface SubscriptionsAuditLog {
  entityType: string;
  entityId: string;
  action: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface CreateGeneratedTaskEffectInput {
  title: string;
  dueDate: string;
  workspaceId?: string | null;
}

export type CreateGeneratedTaskEffectResult =
  | { ok: true; taskId: string }
  | { ok: false; error: string };

export interface LinkSubscriptionToTaskInput {
  subscriptionId: string;
  taskId: string;
  cycleId: string;
}

/**
 * Platform effects needed by the subscription payment workflow, injected by
 * each deployment.
 *
 * `createGeneratedTask` is the odd one out: `todos` is Tasks-owned (ESLint
 * forbids Subscriptions from writing it directly, mirroring the DB-ownership
 * boundary), so provisioning next period's payment task can never be a
 * self-contained Supabase call inside this package — unlike
 * `@nevora/tasks-runtime`'s effects, which are all self-contained because
 * Tasks never needs to reach into another product's tables. Whoever
 * constructs `SubscriptionsRuntimeDependencies` supplies this — in-process it
 * is the same `platform/task-lifecycle/server.ts` seam Subscriptions already
 * calls today; once Subscriptions is a separate deployment it becomes an HTTP
 * call to Tasks without this package changing.
 */
export interface SubscriptionsRuntimeEffects {
  createGeneratedTask(input: CreateGeneratedTaskEffectInput): Promise<CreateGeneratedTaskEffectResult>;
  emitDomainEvent(event: SubscriptionsDomainEvent): Promise<void>;
  emitAuditLog(entry: SubscriptionsAuditLog): Promise<void>;
  linkSubscriptionToTask(link: LinkSubscriptionToTaskInput): Promise<void>;
}
