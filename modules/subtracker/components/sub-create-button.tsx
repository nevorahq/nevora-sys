"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { RestrictedActionTooltip, useAccessGate } from "@/platform/access/ui";
import { CreateSubscriptionForm } from "./create-subscription-form";
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
  defaultCurrency: string;
}

export function SubCreateButton({ dict, defaultCurrency }: SubCreateButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { blocked, message } = useAccessGate("write");

  return (
    <>
      {/* Mobile: круглая кнопка с иконкой. Desktop: pill-кнопка с текстом */}
      <RestrictedActionTooltip message={blocked ? message : dict.subscriptions.form.addButton}>
        <Button
          onClick={() => setIsOpen(true)}
          disabled={blocked}
          aria-label={blocked ? `${dict.subscriptions.form.addButton}. ${message}` : dict.subscriptions.form.addButton}
          className="shrink-0 w-9 h-9 p-0 rounded-full sm:w-auto sm:h-auto sm:px-5 sm:py-2.5 sm:rounded-(--neu-radius-pill)"
        >
          <PlusIcon size={16} strokeWidth={2} />
          <span className="hidden sm:inline">{dict.subscriptions.form.addButton}</span>
        </Button>
      </RestrictedActionTooltip>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={dict.subscriptions.form.addButton}
        closeLabel={dict.common.close}
      >
        <CreateSubscriptionForm
          dict={dict}
          defaultCurrency={defaultCurrency}
          onSuccess={() => setIsOpen(false)}
        />
      </Modal>
    </>
  );
}
