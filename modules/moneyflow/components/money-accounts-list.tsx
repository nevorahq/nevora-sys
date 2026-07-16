"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { PencilIcon, PowerOffIcon, ArrowRightLeftIcon, WalletIcon, CreditCardIcon, BuildingIcon, PiggyBankIcon } from "lucide-react";
import { deactivateAccountAction } from "../actions/deactivate-account.action";
import { formatMoney } from "@/shared/utils/format-money";
import { AccountEditForm } from "./account-edit-form";
import { TransferForm } from "./transfer-form";
import { Modal } from "@/shared/ui/modal";
import { cn } from "@/shared/utils/cn";
import { ROUTES } from "@/shared/config/routes";
import type { AccountWithBalance } from "../queries/get-accounts-with-balances";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface MoneyAccountsListProps {
  accounts: AccountWithBalance[];
  dict: Dictionary;
}

export function MoneyAccountsList({ accounts, dict }: MoneyAccountsListProps) {
  if (accounts.length === 0) return null;

  // Group accounts by currency, preserving first-appearance order. Each currency
  // becomes its own framed group; accounts inside share a currency so their
  // balances are directly comparable.
  const groups: { currency: string; items: AccountWithBalance[] }[] = [];
  const byCurrency = new Map<string, { currency: string; items: AccountWithBalance[] }>();
  for (const account of accounts) {
    let group = byCurrency.get(account.currency);
    if (!group) {
      group = { currency: account.currency, items: [] };
      byCurrency.set(account.currency, group);
      groups.push(group);
    }
    group.items.push(account);
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        {dict.money.accounts.title}
      </h2>
      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <div
            key={group.currency}
            className="rounded-(--neu-radius-lg) border border-border-soft p-2.5 sm:p-3"
          >
            <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-text-muted">
              {group.currency}
            </p>
            {/* Vertical on mobile, horizontal (wrapping) row on ≥sm. */}
            <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
              {group.items.map((account) => (
                <div key={account.id} className="sm:min-w-[15rem] sm:flex-1">
                  <AccountItem account={account} accounts={accounts} dict={dict} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountItem({
  account,
  accounts,
  dict,
}: {
  account: AccountWithBalance;
  accounts: AccountWithBalance[];
  dict: Dictionary;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isDeactivating, startDeactivate] = useTransition();
  const t = dict.money.accounts;

  function handleDeactivate() {
    if (!confirm(t.deactivateConfirm)) return;
    setActionError(null);
    startDeactivate(async () => {
      const result = await deactivateAccountAction(account.id);
      if (result.error) setActionError(result.error);
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
          "soft-card-sm flex items-center gap-2 p-2 transition-opacity hover:shadow-neu-card",
          isDeactivating && "opacity-50 pointer-events-none",
        )}
      >
        <Link
          href={`${ROUTES.money}/accounts/${account.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-(--neu-radius-md) p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          aria-label={`Open account: ${account.name}`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-(--neu-radius-md) bg-accent-lilac-soft">
            <Icon size={18} className="text-accent-lilac" strokeWidth={2} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">{account.name}</p>
            <p className="text-xs text-text-muted">{t.types[account.type]}</p>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold text-text-primary tabular-nums">
              {formatMoney(account.balance)}
            </p>
          </div>
        </Link>

        {/* Transfer button */}
        <button
          type="button"
          onClick={() => setIsTransferring(true)}
          className="soft-icon-button h-8 w-8 text-text-muted hover:text-text-primary"
          aria-label={dict.money.transfer.buttonLabel}
        >
          <ArrowRightLeftIcon size={15} strokeWidth={1.75} />
        </button>

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

      {actionError && (
        <p role="alert" className="px-4 text-sm text-danger">
          {actionError}
        </p>
      )}

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

      {/* Transfer Modal */}
      <Modal
        isOpen={isTransferring}
        onClose={() => setIsTransferring(false)}
        title={`${dict.money.transfer.title} ${account.name}`}
        closeLabel={dict.common.close}
      >
        <TransferForm
          fromAccount={account}
          accounts={accounts}
          dict={dict}
          onSuccess={() => setIsTransferring(false)}
        />
      </Modal>
    </>
  );
}
