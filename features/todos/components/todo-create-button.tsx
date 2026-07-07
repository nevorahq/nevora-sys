"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { RestrictedActionTooltip, useAccessGate } from "@/modules/billing/components/access-state";
import { TodoForm } from "./todo-form";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface TodoCreateButtonProps {
  dict: Dictionary;
  /** Optional project options for the inline project selector. */
  projects?: { id: string; name: string }[];
}

export function TodoCreateButton({ dict, projects }: TodoCreateButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { blocked, message } = useAccessGate("write");

  return (
    <>
      <RestrictedActionTooltip message={blocked ? message : dict.todos.form.createButton}>
        <Button
          onClick={() => setIsOpen(true)}
          disabled={blocked}
          aria-label={blocked ? `${dict.todos.form.createButton}. ${message}` : dict.todos.form.createButton}
          className="shrink-0 w-9 h-9 p-0 rounded-full sm:w-auto sm:h-auto sm:px-5 sm:py-2.5 sm:rounded-(--neu-radius-pill)"
        >
          <PlusIcon size={16} strokeWidth={2} />
          <span className="hidden sm:inline">{dict.todos.form.createButton}</span>
        </Button>
      </RestrictedActionTooltip>

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
