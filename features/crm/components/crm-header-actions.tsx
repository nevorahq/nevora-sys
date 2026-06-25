"use client";

import { useState } from "react";
import { UserIcon, TrendingUpIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { CreateClientForm } from "./create-client-form";
import { CreateDealForm } from "./create-deal-form";
import type { CrmPipelineWithStages, CrmClient } from "@/modules/crm/types/crm.types";

interface CrmHeaderActionsProps {
  pipeline: CrmPipelineWithStages | null;
  clients: CrmClient[];
}

export function CrmHeaderActions({ pipeline, clients }: CrmHeaderActionsProps) {
  const [clientOpen, setClientOpen] = useState(false);
  const [dealOpen, setDealOpen]     = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          onClick={() => setClientOpen(true)}
          className="shrink-0 h-9 gap-1.5 px-3 text-xs sm:text-sm"
        >
          <UserIcon size={14} strokeWidth={2} />
          <span>New Client</span>
        </Button>

        {pipeline && (
          <Button
            onClick={() => setDealOpen(true)}
            className="shrink-0 h-9 gap-1.5 px-3 text-xs sm:text-sm"
          >
            <TrendingUpIcon size={14} strokeWidth={2} />
            <span>New Deal</span>
          </Button>
        )}
      </div>

      <Modal
        isOpen={clientOpen}
        onClose={() => setClientOpen(false)}
        title="New Client"
      >
        <CreateClientForm onSuccess={() => setClientOpen(false)} />
      </Modal>

      {pipeline && (
        <Modal
          isOpen={dealOpen}
          onClose={() => setDealOpen(false)}
          title="New Deal"
        >
          <CreateDealForm
            pipeline={pipeline}
            clients={clients}
            onSuccess={() => setDealOpen(false)}
          />
        </Modal>
      )}
    </>
  );
}
