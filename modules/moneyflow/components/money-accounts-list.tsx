"use client";

import { useState, useTransition } from "react";
import { PencilIcon, PowerOffIcon, WalletIcon, CreditCardIcon, BuildingIcon, PiggyBankIcon } from "lucide-react";
import { deactivateAccountAction } from "../actions/deactivate-account.action";
import { formatMoney } from "@/shared/utils/format-money";
import { AccountEditForm } from "./account-edit-form";
import { Modal } from "@/shared/ui/modal";
import { cn } from "@/shared/utils/cn";
import type { MoneyAccount } from "../types/moneyflow.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface MoneyAccountsListProps {
  accounts: MoneyAccount[];
  dict: Dictionary;
}

export function MoneyAccountsList({ accounts, dict }: MoneyAccountsListProps) {
  if (accounts.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        {dict.money.accounts.title}
      </h2>
      <div className="flex flex-col gap-2.5">
        {accounts.map((account) => (
          <AccountItem key={account.id} account={account} dict={dict} />
        ))}
      </div>
    </div>
  );
}

function AccountItem({ account, dict }: { account: MoneyAccount; dict: Dictionary }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeactivating, startDeactivate] = useTransition();
  const t = dict.money.accounts;

  function handleDeactivate() {
    if (!confirm(t.deactivateConfirm)) return;
    startDeactivate(async () => {
      await deactivateAccountAction(account.id);
    });
  }

  const typeIcons = {
    cash: WalletIcon,
    card: CreditCardIcon,
    bank: BuildingIcon,
    savings: PiggyBankIcon,
    other: WalletIcon,
  } as const;

  const Icon = typeIcons[account.type] ?? WalletIcon;

  return (
    <>
      <div
        className={cn(
          "soft-card-sm flex items-center gap-3 p-4 transition-opacity",
          isDeactivating && "opacity-50 pointer-events-none",
        )}
      >
        {/* Icon */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-(--neu-radius-md) bg-accent-lilac-soft">
          <Icon size={18} className="text-accent-lilac" strokeWidth={2} />
        </div>

        {/* Name + type */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{account.name}</p>
          <p className="text-xs text-text-muted">{t.types[account.type]}</p>
        </div>

        {/* Initial balance */}
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-text-primary tabular-nums">
            {formatMoney(account.initial_balance)}
          </p>
          <p className="text-xs text-text-muted">{account.currency}</p>
        </div>

        {/* Edit button */}
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="soft-icon-button h-8 w-8 text-text-muted hover:text-text-primary"
          aria-label={t.editButton}
        >
          <PencilIcon size={15} strokeWidth={1.75} />
        </button>

        {/* Deactivate button */}
        <button
          type="button"
          onClick={handleDeactivate}
          className="soft-icon-button h-8 w-8 text-text-muted hover:text-danger"
          aria-label={t.deactivateButton}
        >
          <PowerOffIcon size={15} strokeWidth={1.75} />
        </button>
      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        title={t.editButton}
        closeLabel={dict.common.close}
      >
        <AccountEditForm
          account={account}
          dict={dict}
          onSuccess={() => setIsEditing(false)}
        />
      </Modal>
    </>
  );
}
