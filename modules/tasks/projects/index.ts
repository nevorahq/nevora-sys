// Projects (Tasks module) — public surface.

// Types & constants
export type { Project, ProjectWithStats, ProjectRef } from "./types/project.types";
export {
  PROJECT_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_STATUS_LABELS,
  PROJECT_PRIORITY_LABELS,
  PROJECT_COLORS,
  VISIBLE_PROJECT_STATUSES,
  type ProjectStatus,
  type ProjectPriority,
} from "./constants/project.constants";

// Queries
export { getProjects } from "./queries/get-projects";
export { getProjectById } from "./queries/get-project-by-id";
export { getProjectTasks, getUnassignedTasks } from "./queries/get-project-tasks";

// Actions
export { createProjectAction } from "./actions/create-project.action";
export { updateProjectAction } from "./actions/update-project.action";
export { archiveProjectAction } from "./actions/archive-project.action";
export {
  assignTaskToProjectAction,
  removeTaskFromProjectAction,
} from "./actions/assign-task-to-project.action";

// Components
export { ProjectList } from "./components/project-list";
export { ProjectHeader } from "./components/project-header";
export { ProjectTaskList } from "./components/project-task-list";
export { CreateProjectButton } from "./components/create-project-button";
export { ProjectStatusBadge } from "./components/project-status-badge";
export { ProjectProgressBar } from "./components/project-progress-bar";
