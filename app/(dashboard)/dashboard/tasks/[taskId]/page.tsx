import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CalendarIcon, FileTextIcon, Repeat2Icon, TagIcon, UsersIcon } from "lucide-react";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { createClient } from "@/lib/supabase/server";
import { getTaskById, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, type TaskPriority, type TaskStatus } from "@/modules/tasks";
import { UniversalRelationViewer } from "@/modules/relations";
import { ROUTES } from "@/shared/config/routes";

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: "bg-accent-green-soft text-accent-green", medium: "bg-accent-yellow-soft text-accent-yellow", high: "bg-accent-pink-soft text-accent-pink",
};

export default async function TaskPreviewPage({ params }: PageProps<"/dashboard/tasks/[taskId]">) {
  const { taskId } = await params;
  const ctx = await requireOrg();
  const { org } = ctx;
  const task = await getTaskById(org.id, taskId);
  if (!task) notFound();

  const supabase = await createClient();
  const profileIds = [...new Set([task.created_by, ...task.assignees.map((assignee) => assignee.user_id)].filter((id): id is string => Boolean(id)))];
  const [{ data: profiles }, { data: document }] = await Promise.all([
    profileIds.length ? supabase.from("profiles").select("id, display_name").in("id", profileIds) : Promise.resolve({ data: [] as Array<{ id: string; display_name: string | null }> }),
    supabase.from("documents").select("id, title").eq("organization_id", org.id).eq("entity_type", "task").eq("entity_id", task.id).maybeSingle(),
  ]);
  const names = Object.fromEntries((profiles ?? []).map((profile) => [profile.id, profile.display_name?.trim() || "Unknown user"]));

  return <>
    <div className="mb-6"><Link href={ROUTES.tasks} className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary"><ArrowLeftIcon size={16} /> Tasks</Link><div className="mt-4 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold text-text-primary">{task.title}</h1><p className="mt-1 text-sm text-text-muted">Created by {task.created_by ? names[task.created_by] ?? "Unknown user" : "Unknown user"}</p></div><span className="rounded-full bg-surface-sunken px-3 py-1 text-xs font-medium text-text-secondary">{TASK_STATUS_LABELS[task.status as TaskStatus]}</span></div></div>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <main className="space-y-6"><section className="soft-card p-5 sm:p-6"><h2 className="text-base font-semibold text-text-primary">Description</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-primary">{task.description || "No description added."}</p></section>{document && <section className="soft-card p-5 sm:p-6"><div className="flex items-center gap-2"><FileTextIcon size={18} className="text-text-secondary" /><h2 className="text-base font-semibold text-text-primary">Document</h2></div><Link href={`${ROUTES.documents}/${document.id}`} className="mt-3 block text-sm font-medium text-text-secondary underline hover:text-text-primary">{document.title}</Link></section>}<UniversalRelationViewer entityType="task" entityId={task.id} allowCreate={canDo(ctx, "entity_link.create")} allowDelete={canDo(ctx, "entity_link.delete")} revalidate={`${ROUTES.tasks}/${task.id}`} /></main>
      <aside className="space-y-4"><section className="soft-card-sm space-y-4 p-4"><div><p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted"><TagIcon size={13} /> Priority</p><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${PRIORITY_STYLES[task.priority as TaskPriority]}`}>{TASK_PRIORITY_LABELS[task.priority as TaskPriority]}</span></div>{task.due_date && <div><p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted"><CalendarIcon size={13} /> Due date</p><p className="mt-2 text-sm text-text-primary">{new Date(`${task.due_date}T00:00:00`).toLocaleDateString()}</p></div>}{task.recurrence !== "none" && <div><p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted"><Repeat2Icon size={13} /> Recurrence</p><p className="mt-2 text-sm capitalize text-text-primary">{task.recurrence}</p></div>}</section><section className="soft-card-sm p-4"><h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary"><UsersIcon size={16} /> Assignees</h2>{task.assignees.length ? <ul className="mt-3 space-y-2">{task.assignees.map((assignee) => <li key={assignee.id} className="text-sm text-text-secondary">{names[assignee.user_id] ?? "Unknown user"}</li>)}</ul> : <p className="mt-3 text-sm text-text-muted">No assignees.</p>}</section></aside>
    </div>
  </>;
}
