"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { RestrictedActionTooltip, useAccessGate } from "@/modules/billing/components/access-state";
import { ProjectForm } from "./project-form";

export function CreateProjectButton({ label = "New project" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const { blocked, message } = useAccessGate("write");

  return (
    <>
      <RestrictedActionTooltip message={blocked ? message : label}>
        <Button onClick={() => setOpen(true)} disabled={blocked} aria-label={blocked ? `${label}. ${message}` : label} className="h-10 gap-1.5 px-4">
          <PlusIcon size={16} strokeWidth={2.25} />
          {label}
        </Button>
      </RestrictedActionTooltip>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="New project">
        <ProjectForm onSuccess={() => setOpen(false)} />
      </Modal>
    </>
  );
}
