"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PlusIcon, XIcon, LinkIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { Select } from "@/shared/ui/select";
import { RestrictedActionTooltip, useAccessGate } from "@/modules/billing/components/access-state";
import { cn } from "@/shared/utils/cn";
import { ROUTES } from "@/shared/config/routes";
import { TaskStatusBadge } from "@/features/todos/components/task-status-badge";
import { TodoForm } from "@/features/todos/components/todo-form";
import { TaskSortSelect } from "@/features/todos/components/task-sort-select";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { Task } from "@/modules/tasks/types/task.types";
import type { TaskSort } from "@/modules/tasks/constants/task-sort.constants";
import {
  assignTaskToProjectAction,
  removeTaskFromProjectAction,
} from "../actions/assign-task-to-project.action";

interface ProjectTaskListProps {
  projectId: string;
  tasks: Task[];
  unassignedTasks: Task[];
  dict: Dictionary;
  canManage: boolean;
  sort: TaskSort;
}

export function ProjectTaskList({
  projectId,
  tasks,
  unassignedTasks,
  dict,
  canManage,
  sort,
}: ProjectTaskListProps) {
  const router = useRouter();
  const p = dict.projects;
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [isPending, startTransition] = useTransition();
  const { blocked, message } = useAccessGate("write");
  const allowManage = canManage && !blocked;

  function handleAddExisting() {
    if (!selectedTaskId) return;
    startTransition(async () => {
      await assignTaskToProjectAction(selectedTaskId, projectId);
      setAdding(false);
      setSelectedTaskId("");
      router.refresh();
    });
  }

  function handleRemove(taskId: string) {
    startTransition(async () => {
      await removeTaskFromProjectAction(taskId);
      router.refresh();
    });
  }

  return (
    <div className="soft-card flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-text-primary">
            {p.tasks} <span className="text-text-muted">({tasks.length})</span>
          </h2>
          <TaskSortSelect current={sort} />
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {unassignedTasks.length > 0 && (
              <RestrictedActionTooltip message={blocked ? message : p.addExisting}>
                <Button variant="secondary" disabled={!allowManage} className="h-9 gap-1.5 px-3 text-xs" onClick={() => setAdding(true)}>
                  <LinkIcon size={14} /> {p.addExisting}
                </Button>
              </RestrictedActionTooltip>
            )}
            <RestrictedActionTooltip message={blocked ? message : p.newTask}>
              <Button className="h-9 gap-1.5 px-3 text-xs" disabled={!allowManage} onClick={() => setCreating(true)}>
                <PlusIcon size={14} /> {p.newTask}
              </Button>
            </RestrictedActionTooltip>
          </div>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-(--neu-radius-md) border border-dashed border-border-soft px-6 py-10 text-center">
          <p className="text-sm text-text-muted">{p.noTasksInProject}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className={cn(
                "flex items-center gap-3 rounded-(--neu-radius-md) bg-surface-sunken px-3 py-2.5",
                isPending && "opacity-60",
              )}
            >
              <TaskStatusBadge taskId={task.id} status={task.status} dict={dict} />
              <Link
                href={`${ROUTES.tasks}/${task.id}`}
                className="min-w-0 flex-1 truncate text-sm text-text-primary hover:underline"
              >
                {task.title}
              </Link>
              {canManage && (
                <button
                  type="button"
                  onClick={() => handleRemove(task.id)}
                  disabled={blocked}
                  aria-label={p.removeFromProject}
                  title={blocked ? message : p.removeFromProject}
                  className="soft-icon-button h-7 w-7 text-text-muted hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <XIcon size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Create a task already attached to this project */}
      <Modal isOpen={creating} onClose={() => setCreating(false)} title={p.newTaskInProject}>
        <TodoForm dict={dict} fixedProjectId={projectId} onSuccess={() => { setCreating(false); router.refresh(); }} />
      </Modal>

      {/* Attach an existing unassigned task */}
      <Modal isOpen={adding} onClose={() => setAdding(false)} title={p.addExistingTask}>
        <div className="space-y-4">
          <Select
            id="existing-task"
            label={p.unassignedTask}
            value={selectedTaskId}
            onChange={(e) => setSelectedTaskId(e.target.value)}
            options={[
              { value: "", label: p.selectTask },
              ...unassignedTasks.map((task) => ({ value: task.id, label: task.title })),
            ]}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" className="h-9 px-4 text-sm" onClick={() => setAdding(false)}>
              {p.cancel}
            </Button>
            <Button className="h-9 px-4 text-sm" isLoading={isPending} disabled={!selectedTaskId} onClick={handleAddExisting}>
              {p.addToProject}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
