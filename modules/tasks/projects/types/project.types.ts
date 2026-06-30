import type { ProjectStatus, ProjectPriority } from "../constants/project.constants";

/**
 * Project — 1:1 with public.projects columns.
 */
export interface Project {
  id: string;
  organization_id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  owner_id: string | null;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  color: string | null;
  icon: string | null;
  progress: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/** Project enriched with task counts for list/detail headers. */
export interface ProjectWithStats extends Project {
  taskCount: number;
  doneCount: number;
}

/** Lightweight project reference for badges/selectors on tasks. */
export interface ProjectRef {
  id: string;
  name: string;
  color: string | null;
  status: ProjectStatus;
}
