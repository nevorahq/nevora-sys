"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { ProjectForm } from "./project-form";

export function CreateProjectButton({ label = "New project" }: { label?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} className="h-10 gap-1.5 px-4">
        <PlusIcon size={16} strokeWidth={2.25} />
        {label}
      </Button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="New project">
        <ProjectForm onSuccess={() => setOpen(false)} />
      </Modal>
    </>
  );
}
