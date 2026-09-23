"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  LayoutGridIcon,
  ListTodoIcon,
  Repeat2Icon,
  WalletCardsIcon,
  type LucideIcon,
} from "lucide-react";
import {
  authUrl,
  ROUTES,
  type ProductEntryRoute,
} from "@/shared/config/routes";
import type { Locale } from "@/shared/i18n/constants";
import { cn } from "@/shared/utils/cn";

interface ProductEntryMenuProps {
  locale: Locale;
  /** На auth-странице меняет next, не уводя пользователя с текущей формы. */
  authRoute?: typeof ROUTES.login | typeof ROUTES.register;
  currentDestination?: ProductEntryRoute;
}

interface ProductLink {
  destination: ProductEntryRoute;
  labelKey: "tasks" | "finance" | "subscriptions";
  icon: LucideIcon;
}

const productLinks: ProductLink[] = [
  { destination: ROUTES.tasks, labelKey: "tasks", icon: ListTodoIcon },
  { destination: ROUTES.money, labelKey: "finance", icon: WalletCardsIcon },
  { destination: ROUTES.subscriptions, labelKey: "subscriptions", icon: Repeat2Icon },
];

const labels = {
  en: {
    menu: "Choose an application",
    tasks: "Tasks",
    finance: "Finance",
    subscriptions: "Subscriptions",
  },
  ro: {
    menu: "Alege o aplicație",
    tasks: "Sarcini",
    finance: "Finanțe",
    subscriptions: "Abonamente",
  },
  ru: {
    menu: "Выбрать приложение",
    tasks: "Задачи",
    finance: "Финансы",
    subscriptions: "Подписки",
  },
} as const;

/** Иконка выбора продукта с локализованным и доступным dropdown-меню. */
export function ProductEntryMenu({
  locale,
  authRoute,
  currentDestination,
}: ProductEntryMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const copy = labels[locale];

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={copy.menu}
        title={copy.menu}
        onClick={() => setIsOpen((value) => !value)}
        className={cn(
          "soft-icon-button h-11 w-11 sm:h-9 sm:w-9",
          isOpen && "border-border-strong text-text-primary",
        )}
      >
        <LayoutGridIcon size={17} strokeWidth={1.9} aria-hidden="true" />
      </button>

      {isOpen && (
        <ul
          role="menu"
          aria-label={copy.menu}
          className="absolute left-0 top-[calc(100%+0.5rem)] z-50 flex min-w-52 flex-col overflow-hidden rounded-(--neu-radius-md) border border-border-soft bg-surface-elevated p-1 shadow-neu-card"
        >
          {productLinks.map(({ destination, labelKey, icon: Icon }) => {
            const isActive = destination === currentDestination;
            return (
              <li key={destination} role="none">
                <Link
                  href={authRoute ? authUrl(authRoute, destination) : destination}
                  role="menuitem"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "soft-focus flex items-center gap-3 rounded-(--neu-radius-sm) px-3 py-2.5 text-sm transition-colors",
                    isActive
                      ? "font-semibold text-text-primary"
                      : "font-medium text-text-secondary hover:bg-surface hover:text-text-primary",
                  )}
                >
                  <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
                  <span className="flex-1">{copy[labelKey]}</span>
                  {isActive && <CheckIcon size={16} strokeWidth={2.2} aria-hidden="true" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
