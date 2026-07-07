"use client";

import { useState } from "react";
import { WalletIcon, ArrowRightLeftIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { RestrictedActionTooltip, useAccessGate } from "@/modules/billing/components/access-state";
import { CreateAccountForm } from "./create-account-form";
import { CreateTransactionForm } from "./create-transaction-form";
import type { MoneyAccount, MoneyCategory } from "../types/moneyflow.types";
import type { Subscription } from "@/modules/subtracker/types/subtracker.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface MoneyCreateButtonsProps {
  dict: Dictionary;
  defaultCurrency: string;
  accounts: MoneyAccount[];
  categories: MoneyCategory[];
  subscriptions?: Subscription[];
}

export function MoneyCreateButtons({ dict, defaultCurrency, accounts, categories, subscriptions }: MoneyCreateButtonsProps) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const { blocked, message } = useAccessGate("write");

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Accounts */}
        <RestrictedActionTooltip message={blocked ? message : dict.money.accounts.buttonLabel}>
          <Button
            onClick={() => setAccountOpen(true)}
            disabled={blocked}
            aria-label={blocked ? `${dict.money.accounts.buttonLabel}. ${message}` : dict.money.accounts.buttonLabel}
            className="shrink-0 w-9 h-9 p-0 rounded-full sm:w-auto sm:h-auto sm:px-4 sm:py-2.5 sm:rounded-(--neu-radius-pill)"
          >
            <WalletIcon size={15} strokeWidth={2} />
            <span className="hidden sm:inline">{dict.money.accounts.buttonLabel}</span>
          </Button>
        </RestrictedActionTooltip>

        {/* Transaction */}
        <RestrictedActionTooltip message={blocked ? message : dict.money.transactions.buttonLabel}>
          <Button
            onClick={() => setTransactionOpen(true)}
            disabled={blocked}
            aria-label={blocked ? `${dict.money.transactions.buttonLabel}. ${message}` : dict.money.transactions.buttonLabel}
            className="shrink-0 w-9 h-9 p-0 rounded-full sm:w-auto sm:h-auto sm:px-4 sm:py-2.5 sm:rounded-(--neu-radius-pill)"
          >
            <ArrowRightLeftIcon size={15} strokeWidth={2} />
            <span className="hidden sm:inline">{dict.money.transactions.buttonLabel}</span>
          </Button>
        </RestrictedActionTooltip>
      </div>

      {/* Account Modal */}
      <Modal
        isOpen={accountOpen}
        onClose={() => setAccountOpen(false)}
        title={dict.money.accounts.add}
        closeLabel={dict.common.close}
      >
        <CreateAccountForm
          dict={dict}
          defaultCurrency={defaultCurrency}
          onSuccess={() => setAccountOpen(false)}
        />
      </Modal>

      {/* Transaction Modal */}
      <Modal
        isOpen={transactionOpen}
        onClose={() => setTransactionOpen(false)}
        title={dict.money.transactions.add}
        closeLabel={dict.common.close}
      >
        <CreateTransactionForm
          dict={dict}
          accounts={accounts}
          categories={categories}
          subscriptions={subscriptions}
          onSuccess={() => setTransactionOpen(false)}
        />
      </Modal>
    </>
  );
}
