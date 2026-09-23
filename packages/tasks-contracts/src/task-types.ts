import type {
  TaskStatus,
  TaskPriority,
  TaskRelationType,
} from "./task-constants";

export interface Task {
  id: string;
  organization_id: string;
  workspace_id: string;
  created_by: string | null;
  updated_by: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  recurrence: "none" | "monthly";
  recurrence_source_id: string | null;
  deal_id?: string | null;
  project_id?: string | null;
  position: number | null;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  /** Denormalized by the task_smart_list view; present on list reads only. */
  project_name?: string | null;
  project_color?: string | null;
  project_status?: string | null;
}

export interface TaskAssignee {
  id: string;
  task_id: string;
  user_id: string;
  assigned_by: string | null;
  created_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  organization_id: string;
  user_id: string;
  content: string;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRelation {
  id: string;
  task_id: string;
  related_task_id: string;
  relation_type: TaskRelationType;
  created_by: string | null;
  created_at: string;
}

// Task с загруженными assignees (для списков и детальной страницы)
export interface TaskWithAssignees extends Task {
  assignees: TaskAssignee[];
}

// Task с полным контекстом (для детальной страницы)
export interface TaskWithDetails extends TaskWithAssignees {
  comments: TaskComment[];
  relations: TaskRelation[];
}

export interface TaskSummary {
  total: number;
  active: number;
  completed: number;
  overdue: number;
  dueToday: number;
  byStatus: Record<TaskStatus, number>;
}
