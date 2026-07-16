import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth/require-org";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { getProjectById } from "@/modules/tasks/projects/queries/get-project-by-id";
import { getProjectTasks, getUnassignedTasks } from "@/modules/tasks/projects/queries/get-project-tasks";
import { ProjectHeader } from "@/modules/tasks/projects/components/project-header";
import { ProjectTaskList } from "@/modules/tasks/projects/components/project-task-list";
import { parseTaskSort } from "@/modules/tasks/schemas/task-sort.schema";

export const metadata = { title: "Project" };

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { projectId } = await params;
  const { sort: rawSort } = await searchParams;
  const sort = parseTaskSort(rawSort);
  const { org, permissions } = await requireOrg();

  const project = await getProjectById(org.id, projectId);
  if (!project) {
    notFound();
  }

  const [tasks, unassignedTasks, { dict }] = await Promise.all([
    getProjectTasks(org.id, projectId, sort),
    getUnassignedTasks(org.id),
    getDictionary(),
  ]);

  // Resolve the owner's display name (best-effort; null when missing).
  let ownerName: string | null = null;
  if (project.owner_id) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", project.owner_id)
      .maybeSingle();
    ownerName = (data?.display_name as string | null) || null;
  }

  const canManage = permissions.has("data.write");
  const canArchive = permissions.has("data.delete");

  return (
    <div className="flex flex-col gap-5">
      <ProjectHeader
        project={project}
        ownerName={ownerName}
        canManage={canManage}
        canArchive={canArchive}
        t={dict.projects}
      />

      <ProjectTaskList
        projectId={project.id}
        tasks={tasks}
        unassignedTasks={unassignedTasks}
        dict={dict}
        canManage={canManage}
        sort={sort}
      />

      {/* Board view placeholder — Phase 2 (Kanban with drag & drop). */}
      <div className="soft-card flex items-center justify-between p-5">
        <div>
          <p className="text-sm font-medium text-text-secondary">Board view</p>
          <p className="text-xs text-text-muted">Kanban with drag &amp; drop is coming in a later phase.</p>
        </div>
        <span className="soft-badge bg-surface-sunken text-text-muted">Soon</span>
      </div>
    </div>
  );
}
