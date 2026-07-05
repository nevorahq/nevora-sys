import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CircleDotIcon, FileTextIcon, Repeat2Icon, TagIcon, UsersIcon } from "lucide-react";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { createClient } from "@/lib/supabase/server";
import { getTaskById, TASK_PRIORITY_LABELS, type TaskPriority, type TaskStatus } from "@/modules/tasks";
import { getTaskActivityView } from "@/modules/tasks/queries/get-task-activity-view";
import { TaskAssigneesManager, type TaskAssigneeView } from "@/modules/tasks/components/task-assignees-manager";
import { TaskActivity } from "@/modules/tasks/components/task-activity";
import { TaskDueDateField } from "@/modules/tasks/components/task-due-date-field";
import { getOrgMembers } from "@/modules/crm/queries/get-org-members";
import { getPaymentCycleByTaskId } from "@/modules/subtracker/queries/get-payment-cycles";
import { SubscriptionPaymentTaskPanel } from "@/modules/subtracker/components/subscription-payment-task-panel";
import { FinancialTaskPanel } from "@/modules/tasks/components/financial-task-panel";
import { getAccounts } from "@/modules/moneyflow/queries/get-accounts";
import { UniversalRelationViewer } from "@/modules/relations";
import { TaskStatusBadge } from "@/features/todos/components/task-status-badge";
import {
  InlineTaskDescription,
  InlineTaskTitle,
  TaskEditModeButton,
  TaskInlineEditProvider,
} from "@/features/todos/components/task-inline-edit";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: "bg-accent-green-soft text-accent-green", medium: "bg-accent-yellow-soft text-accent-yellow", high: "bg-accent-pink-soft text-accent-pink",
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  todo: "bg-surface-sunken text-text-secondary", in_progress: "bg-accent-lilac-soft text-accent-lilac", done: "bg-accent-green-soft text-accent-green",
};

export default async function TaskPreviewPage({ params }: PageProps<"/dashboard/tasks/[taskId]">) {
  const { taskId } = await params;
  const ctx = await requireOrg();
  const { org, user } = ctx;
  const task = await getTaskById(org.id, taskId);
  if (!task) notFound();
  const { dict } = await getDictionary();

  const supabase = await createClient();
  const profileIds = [...new Set([task.created_by, ...task.assignees.map((assignee) => assignee.user_id)].filter((id): id is string => Boolean(id)))];
  const [{ data: profiles }, { data: document }, members, activity] = await Promise.all([
    profileIds.length ? supabase.from("profiles").select("id, display_name").in("id", profileIds) : Promise.resolve({ data: [] as Array<{ id: string; display_name: string | null }> }),
    supabase.from("documents").select("id, title").eq("organization_id", org.id).eq("entity_type", "task").eq("entity_id", task.id).maybeSingle(),
    getOrgMembers(org.id),
    getTaskActivityView(task.id),
  ]);
  const names = Object.fromEntries((profiles ?? []).map((profile) => [profile.id, profile.display_name?.trim() || "Unknown user"]));

  // Управлять ответственными может создатель ИЛИ управляющая роль (manager+).
  const canManageAssignees = task.created_by === user.id || canDo(ctx, "data.delete");
  const canEditTask = canDo(ctx, "data.write");

  // Subscription payment task? Surface the specialized Mark-as-paid workflow.
  const paymentCycle = await getPaymentCycleByTaskId(org.id, task.id);
  const [paymentSubscription, paymentAccounts] = paymentCycle
    ? await Promise.all([
        supabase
          .from("subscriptions")
          .select("id, name")
          .eq("id", paymentCycle.subscription_id)
          .eq("organization_id", org.id)
          .maybeSingle()
          .then((r) => r.data),
        getAccounts(org.id),
      ])
    : [null, []];

  // One-off Financial Context Task (not a subscription payment cycle)? Surface
  // the Financial Context panel with the idempotent Mark-as-paid / Skip / Dismiss.
  const isFinancialTask = task.task_context_type !== "standard";
  const financialAccounts = isFinancialTask && !paymentCycle ? await getAccounts(org.id) : [];

  // Уникальные assignees (по user_id) с пометкой создателя.
  const assigneeViews: TaskAssigneeView[] = Array.from(
    new Map(task.assignees.map((a) => [a.user_id, a])).values(),
  ).map((a) => ({
    userId:    a.user_id,
    name:      names[a.user_id] ?? null,
    isCreator: a.user_id === task.created_by,
  }));

  return (
    <TaskInlineEditProvider taskId={task.id} initialTitle={task.title} initialDescription={task.description} canEdit={canEditTask} dict={dict}>
      <div className="mb-6">
        <Link href={ROUTES.tasks} className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary"><ArrowLeftIcon size={16} /> Tasks</Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <InlineTaskTitle />
            <p className="mt-1 text-sm text-text-muted">Created by {task.created_by ? names[task.created_by] ?? "Unknown user" : "Unknown user"}</p>
          </div>
          <div className="flex items-center gap-2">
            {canEditTask && <TaskEditModeButton />}
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[task.status as TaskStatus]}`}>{dict.todos.statuses[task.status as TaskStatus]}</span>
          </div>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="space-y-6">
          <section className="soft-card p-5 sm:p-6">
            <h2 className="text-base font-semibold text-text-primary">Description</h2>
            <InlineTaskDescription />
          </section>
          {paymentCycle && (
            <SubscriptionPaymentTaskPanel
              cycle={paymentCycle}
              providerName={paymentSubscription?.name ?? "Subscription"}
              accounts={paymentAccounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
              canWrite={canEditTask}
            />
          )}
          {isFinancialTask && !paymentCycle && (
            <FinancialTaskPanel
              task={{
                id: task.id,
                task_context_type: task.task_context_type,
                provider_name: task.provider_name,
                amount: task.amount,
                currency: task.currency,
                financial_due_date: task.financial_due_date,
                due_date: task.due_date,
                reminder_offset_days: task.reminder_offset_days,
                financial_status: task.financial_status,
                financial_transaction_id: task.financial_transaction_id,
                source_document_id: task.source_document_id,
              }}
              accounts={financialAccounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
              canWrite={canEditTask}
            />
          )}
          {document && <section className="soft-card p-5 sm:p-6"><div className="flex items-center gap-2"><FileTextIcon size={18} className="text-text-secondary" /><h2 className="text-base font-semibold text-text-primary">Document</h2></div><Link href={`${ROUTES.documents}/${document.id}`} className="mt-3 block text-sm font-medium text-text-secondary underline hover:text-text-primary">{document.title}</Link></section>}
          <UniversalRelationViewer entityType="task" entityId={task.id} allowCreate={canDo(ctx, "entity_link.create")} allowDelete={canDo(ctx, "entity_link.delete")} revalidate={`${ROUTES.tasks}/${task.id}`} />
          <TaskActivity taskId={task.id} initialItems={activity.items} initialHasMore={activity.hasMore} createdAt={task.created_at} updatedAt={task.updated_at} error={activity.error} dict={dict} />
        </main>
        <aside className="space-y-4">
          <section className="soft-card-sm space-y-4 p-4"><div><p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted"><CircleDotIcon size={13} /> Status</p><div className="mt-2"><TaskStatusBadge taskId={task.id} status={task.status as TaskStatus} dict={dict} className="items-start" /></div></div><div><p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted"><TagIcon size={13} /> Priority</p><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${PRIORITY_STYLES[task.priority as TaskPriority]}`}>{TASK_PRIORITY_LABELS[task.priority as TaskPriority]}</span></div><TaskDueDateField taskId={task.id} dueDate={task.due_date} status={task.status as TaskStatus} canEdit={canEditTask} dict={dict} />{task.recurrence !== "none" && <div><p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted"><Repeat2Icon size={13} /> Recurrence</p><p className="mt-2 text-sm capitalize text-text-primary">{task.recurrence}</p></div>}</section>
          <section className="soft-card-sm p-4"><h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary"><UsersIcon size={16} /> {dict.todos.assignees.title}</h2><div className="mt-3"><TaskAssigneesManager taskId={task.id} assignees={assigneeViews} members={members.map((m) => ({ id: m.id, name: m.displayName }))} canManage={canManageAssignees} currentUserId={user.id} dict={dict} /></div></section>
        </aside>
      </div>
    </TaskInlineEditProvider>
  );
}
