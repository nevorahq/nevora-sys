"use client";

import { useState } from "react";
import { PlusIcon, WalletIcon, ArrowRightLeftIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { CreateAccountForm } from "./create-account-form";
import { CreateTransactionForm } from "./create-transaction-form";
import type { MoneyAccount, MoneyCategory } from "../types/moneyflow.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface MoneyCreateButtonsProps {
  dict: Dictionary;
  accounts: MoneyAccount[];
  categories: MoneyCategory[];
}

export function MoneyCreateButtons({ dict, accounts, categories }: MoneyCreateButtonsProps) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Add Account */}
        <Button
          onClick={() => setAccountOpen(true)}
          aria-label={dict.money.accounts.add}
          className="shrink-0 w-9 h-9 p-0 rounded-full sm:w-auto sm:h-auto sm:px-4 sm:py-2.5 sm:rounded-(--neu-radius-pill)"
        >
          <WalletIcon size={15} strokeWidth={2} />
          <span className="hidden sm:inline">{dict.money.accounts.add}</span>
        </Button>

        {/* Add Transaction */}
        <Button
          onClick={() => setTransactionOpen(true)}
          aria-label={dict.money.transactions.add}
          className="shrink-0 w-9 h-9 p-0 rounded-full sm:w-auto sm:h-auto sm:px-4 sm:py-2.5 sm:rounded-(--neu-radius-pill)"
        >
          <ArrowRightLeftIcon size={15} strokeWidth={2} />
          <span className="hidden sm:inline">{dict.money.transactions.add}</span>
        </Button>
      </div>

      {/* Account Modal */}
      <Modal
        isOpen={accountOpen}
        onClose={() => setAccountOpen(false)}
        title={dict.money.accounts.add}
        closeLabel={dict.common.close}
      >
        <CreateAccountForm dict={dict} onSuccess={() => setAccountOpen(false)} />
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
          onSuccess={() => setTransactionOpen(false)}
        />
      </Modal>
    </>
  );
}
