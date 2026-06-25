"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { TodoForm } from "./todo-form";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface TodoCreateButtonProps {
  dict: Dictionary;
}

export function TodoCreateButton({ dict }: TodoCreateButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        aria-label={dict.todos.form.createButton}
        className="shrink-0 w-9 h-9 p-0 rounded-full sm:w-auto sm:h-auto sm:px-5 sm:py-2.5 sm:rounded-(--neu-radius-pill)"
      >
        <PlusIcon size={16} strokeWidth={2} />
        <span className="hidden sm:inline">{dict.todos.form.createButton}</span>
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={dict.todos.form.createButton}
        closeLabel={dict.common.close}
      >
        {isOpen && <TodoForm dict={dict} onSuccess={() => setIsOpen(false)} />}
      </Modal>
    </>
  );
}
