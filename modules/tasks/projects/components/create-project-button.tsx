"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { RestrictedActionTooltip, useAccessGate } from "@/modules/billing/components/access-state";
import { ProjectForm } from "./project-form";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

export function CreateProjectButton({ t, label }: { t: Dictionary["projects"]; label?: string }) {
  const [open, setOpen] = useState(false);
  const { blocked, message } = useAccessGate("write");
  const buttonLabel = label ?? t.newProject;

  return (
    <>
      <RestrictedActionTooltip message={blocked ? message : buttonLabel}>
        <Button onClick={() => setOpen(true)} disabled={blocked} aria-label={blocked ? `${buttonLabel}. ${message}` : buttonLabel} className="h-10 gap-1.5 px-4">
          <PlusIcon size={16} strokeWidth={2.25} />
          {buttonLabel}
        </Button>
      </RestrictedActionTooltip>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={t.newProject}>
        <ProjectForm onSuccess={() => setOpen(false)} t={t} />
      </Modal>
    </>
  );
}
