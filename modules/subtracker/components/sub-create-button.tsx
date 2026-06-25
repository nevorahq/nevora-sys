"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { CreateSubscriptionForm } from "./create-subscription-form";
import type { MoneyAccount } from "@/modules/moneyflow/types/moneyflow.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/**
 * SubCreateButton — кнопка "Create Record" + модалка с формой.
 *
 * Архитектура:
 * - Кнопка открывает модалку (isOpen = true)
 * - Модалка содержит CreateSubscriptionForm
 * - Form получает onSuccess → закрывает модалку (isOpen = false)
 * - Закрытие также по Escape, клику на backdrop, кнопке X
 *
 * Почему отдельный компонент, а не логика в page.tsx:
 * page.tsx — Server Component. useState нужен Client Component.
 * SubCreateButton — тонкая Client-обёртка вокруг кнопки + модалки.
 */
interface SubCreateButtonProps {
  dict: Dictionary;
  accounts: MoneyAccount[];
}

export function SubCreateButton({ dict, accounts }: SubCreateButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile: круглая кнопка с иконкой. Desktop: pill-кнопка с текстом */}
      <Button
        onClick={() => setIsOpen(true)}
        aria-label={dict.common.createRecord}
        className="shrink-0 w-9 h-9 p-0 rounded-full sm:w-auto sm:h-auto sm:px-5 sm:py-2.5 sm:rounded-(--neu-radius-pill)"
      >
        <PlusIcon size={16} strokeWidth={2} />
        <span className="hidden sm:inline">{dict.common.createRecord}</span>
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={dict.subscriptions.form.addButton}
        closeLabel={dict.common.close}
      >
        <CreateSubscriptionForm
          dict={dict}
          accounts={accounts}
          onSuccess={() => setIsOpen(false)}
        />
      </Modal>
    </>
  );
}
