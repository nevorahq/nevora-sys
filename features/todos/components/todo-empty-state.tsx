"use client";

import { useState } from "react";
import { CheckSquareIcon } from "lucide-react";
import { Modal } from "@/shared/ui/modal";
import { EmptyState } from "@/shared/ui/empty-state";
import { FirstActionCta } from "@/modules/onboarding/components/first-action-cta";
import { useAccessGate } from "@/modules/billing/components/access-state";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { TodoForm } from "./todo-form";

const icon = <CheckSquareIcon size={24} className="text-text-muted" strokeWidth={1.5} />;

/**
 * Shown when a filter matched nothing. NOT an activation moment — the user has
 * tasks, they just can't see them, and "create your first task" here would be a
 * lie. Stays a plain Server-Component-safe render.
 */
export function TodoFilteredEmptyState({ title }: { title: string }) {
  return <EmptyState icon={icon} title={title} />;
}

interface TodoEmptyStateProps {
  dict: Dictionary;
  projects?: { id: string; name: string }[];
}

/**
 * Action-driven empty state for a workspace with no tasks at all (Phase B / B6).
 *
 * Two ways forward, both guided: create the task directly — opening the same modal
 * as the header button, since navigating to ROUTES.tasks would reload the page the
 * user is standing on — or upload a document and let Nevora propose the task from
 * it. Both record the first action, so the draft follows either way.
 */
export function TodoEmptyState({ dict, projects }: TodoEmptyStateProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { blocked } = useAccessGate("write");

  return (
    <>
      <EmptyState
        icon={icon}
        title={dict.firstRun.empty.tasksTitle}
        description={dict.firstRun.empty.tasksBody}
        actions={
          <>
            <FirstActionCta
              action="create_task"
              label={dict.firstRun.createTask}
              disabled={blocked}
              onActivate={() => setIsOpen(true)}
            />
            <FirstActionCta action="upload_document" label={dict.firstRun.uploadDocument} variant="secondary" />
          </>
        }
      />

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={dict.todos.form.createButton}
        closeLabel={dict.common.close}
      >
        {isOpen && <TodoForm dict={dict} projects={projects} onSuccess={() => setIsOpen(false)} />}
      </Modal>
    </>
  );
}
