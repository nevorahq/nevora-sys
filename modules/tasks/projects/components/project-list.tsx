import { ProjectCard } from "./project-card";
import { ProjectEmptyState } from "./project-empty-state";
import { CreateProjectButton } from "./create-project-button";
import type { ProjectWithStats } from "../types/project.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

export function ProjectList({ projects, t }: { projects: ProjectWithStats[]; t: Dictionary["projects"] }) {
  if (projects.length === 0) {
    return (
      <ProjectEmptyState
        title={t.emptyTitle}
        description={t.emptyDescription}
        action={<CreateProjectButton t={t} />}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} t={t} />
      ))}
    </div>
  );
}
