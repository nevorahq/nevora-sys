import { requireOrg } from "@/lib/auth/require-org";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { getProjects } from "@/modules/tasks/projects/queries/get-projects";
import { ProjectList } from "@/modules/tasks/projects/components/project-list";
import { CreateProjectButton } from "@/modules/tasks/projects/components/create-project-button";
import { TasksSubnav } from "@/features/todos/components/tasks-subnav";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const [{ org, permissions }, { dict }] = await Promise.all([requireOrg(), getDictionary()]);
  const projects = await getProjects(org.id);
  const canCreate = permissions.has("data.write");
  const t = dict.projects;

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">{t.back}</h1>
        {canCreate && <CreateProjectButton t={t} />}
      </div>

      <div className="mt-5">
        <TasksSubnav />
      </div>

      <section className="mt-6">
        <ProjectList projects={projects} t={t} />
      </section>
    </>
  );
}
