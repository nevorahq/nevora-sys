"use server";

import { createTaskAction as createTask } from "./actions/create-task.action";
import { updateTaskAction as updateTask } from "./actions/update-task.action";
import { deleteTaskAction as deleteTask } from "./actions/delete-task.action";
import { changeTaskStatusAction as changeTaskStatus } from "./actions/change-task-status.action";
import { updateTaskDueDateAction as updateTaskDueDate } from "./actions/update-task-due-date.action";
import { addTaskCommentAction as addTaskComment } from "./actions/add-task-comment.action";
import {
  assignTaskAction as assignTask,
  unassignTaskAction as unassignTask,
} from "./actions/assign-task.action";
import { createFinancialTaskFromDocumentAction as createFinancialTaskFromDocument } from "./actions/create-financial-task-from-document.action";
import { createProjectAction as createProject } from "./projects/actions/create-project.action";
import { updateProjectAction as updateProject } from "./projects/actions/update-project.action";
import { archiveProjectAction as archiveProject } from "./projects/actions/archive-project.action";
import {
  assignTaskToProjectAction as assignTaskToProject,
  removeTaskFromProjectAction as removeTaskFromProject,
} from "./projects/actions/assign-task-to-project.action";

export async function createTaskAction(...args: Parameters<typeof createTask>) {
  return createTask(...args);
}

export async function updateTaskAction(...args: Parameters<typeof updateTask>) {
  return updateTask(...args);
}

export async function deleteTaskAction(...args: Parameters<typeof deleteTask>) {
  return deleteTask(...args);
}

export async function changeTaskStatusAction(...args: Parameters<typeof changeTaskStatus>) {
  return changeTaskStatus(...args);
}

export async function updateTaskDueDateAction(...args: Parameters<typeof updateTaskDueDate>) {
  return updateTaskDueDate(...args);
}

export async function addTaskCommentAction(...args: Parameters<typeof addTaskComment>) {
  return addTaskComment(...args);
}

export async function assignTaskAction(...args: Parameters<typeof assignTask>) {
  return assignTask(...args);
}

export async function unassignTaskAction(...args: Parameters<typeof unassignTask>) {
  return unassignTask(...args);
}

export async function createFinancialTaskFromDocumentAction(
  ...args: Parameters<typeof createFinancialTaskFromDocument>
) {
  return createFinancialTaskFromDocument(...args);
}

export async function createProjectAction(...args: Parameters<typeof createProject>) {
  return createProject(...args);
}

export async function updateProjectAction(...args: Parameters<typeof updateProject>) {
  return updateProject(...args);
}

export async function archiveProjectAction(...args: Parameters<typeof archiveProject>) {
  return archiveProject(...args);
}

export async function assignTaskToProjectAction(...args: Parameters<typeof assignTaskToProject>) {
  return assignTaskToProject(...args);
}

export async function removeTaskFromProjectAction(
  ...args: Parameters<typeof removeTaskFromProject>
) {
  return removeTaskFromProject(...args);
}
