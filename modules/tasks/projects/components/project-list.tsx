import { ProjectCard } from "./project-card";
import { ProjectEmptyState } from "./project-empty-state";
import { CreateProjectButton } from "./create-project-button";
import type { ProjectWithStats } from "../types/project.types";

export function ProjectList({ projects }: { projects: ProjectWithStats[] }) {
  if (projects.length === 0) {
    return (
      <ProjectEmptyState
        title="No projects yet"
        description="Group related tasks into a project to track progress and context."
        action={<CreateProjectButton />}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
