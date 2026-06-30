import { requireOrg } from "@/lib/auth/require-org";
import { getProjects } from "@/modules/tasks/projects/queries/get-projects";
import { ProjectList } from "@/modules/tasks/projects/components/project-list";
import { CreateProjectButton } from "@/modules/tasks/projects/components/create-project-button";
import { TasksSubnav } from "@/features/todos/components/tasks-subnav";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const { org, permissions } = await requireOrg();
  const projects = await getProjects(org.id);
  const canCreate = permissions.has("data.write");

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">Projects</h1>
        {canCreate && <CreateProjectButton />}
      </div>

      <div className="mt-5">
        <TasksSubnav />
      </div>

      <section className="mt-6">
        <ProjectList projects={projects} />
      </section>
    </>
  );
}
