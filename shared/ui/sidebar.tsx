"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboardIcon, CheckSquareIcon, WalletIcon, RepeatIcon,
  FileTextIcon, BarChart2Icon, SparklesIcon, SettingsIcon,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { ROUTES } from "@/shared/config/routes";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/**
 * Sidebar Navigation — responsive.
 *
 * Два состояния (чистый CSS, без JS toggle):
 *
 * Mobile (< md):  w-16, только иконки, label скрыт
 * Desktop (≥ md): w-56, иконки + текст
 *
 * Почему CSS-only, а не useState:
 * - Нет JS для переключения → быстрее, нет layout shift при гидрации
 * - Tailwind responsive prefixes (md:) решают задачу декларативно
 * - Если позже нужен toggle-button — добавим state, но CSS-база уже готова
 *
 * Tooltip на mobile:
 * При наведении на иконку — всплывает label через `title` атрибут.
 * Нативный браузерный tooltip, 0 JS. Для кастомного tooltip —
 * добавить CSS group-hover позже.
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

interface SidebarProps {
  dict: Dictionary;
}

export function Sidebar({ dict }: SidebarProps) {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    { href: ROUTES.dashboard,     label: dict.nav.dashboard,     icon: LayoutDashboardIcon },
    { href: ROUTES.tasks,         label: dict.nav.tasks,         icon: CheckSquareIcon },
    { href: ROUTES.money,         label: dict.nav.money,         icon: WalletIcon },
    { href: ROUTES.documents,     label: dict.nav.documents,     icon: FileTextIcon },
    { href: ROUTES.subscriptions, label: dict.nav.subscriptions, icon: RepeatIcon },
    { href: ROUTES.analytics,     label: dict.nav.analytics,     icon: BarChart2Icon },
    { href: ROUTES.ai,            label: dict.nav.ai,            icon: SparklesIcon },
    // Временно скрыт модуль "Запись" (вернуть — раскомментировать строку)
    // { href: ROUTES.booking,       label: dict.nav.booking,       icon: CalendarCheckIcon },
    { href: ROUTES.settings,      label: dict.nav.settings,      icon: SettingsIcon },
  ];

  function isActive(href: string): boolean {
    if (href === ROUTES.dashboard) {
      return pathname === ROUTES.dashboard;
    }
    return pathname.startsWith(href);
  }

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-border-soft bg-surface",
        // Mobile: узкий (только иконки). Desktop: полный.
        "w-16 md:w-56",
        // Плавная анимация ширины при resize
        "transition-[width] duration-200 ease-in-out",
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 border-b border-border-soft px-0 py-4 md:px-5">
        {/* Иконка-логотип: всегда по центру на mobile, слева на desktop */}
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center",
            "rounded-(--neu-radius-md) bg-text-primary text-text-inverse text-xs font-bold",
            // Mobile: центрируем иконку по ширине sidebar
            "mx-auto md:mx-0",
          )}
        >
          N
        </div>
        {/* Текст: скрыт на mobile, виден на desktop */}
        <span className="hidden md:inline text-sm font-semibold text-text-primary tracking-tight">
          nevora-sys
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 md:px-3">
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  // title — нативный tooltip, показывает label при hover на mobile
                  title={item.label}
                  className={cn(
                    "flex items-center rounded-(--neu-radius-md) text-sm font-medium transition-all duration-150",
                    // Mobile: квадратная кнопка, иконка по центру
                    "justify-center p-2.5 md:justify-start md:gap-3 md:px-3 md:py-2.5",
                    active
                      ? "bg-surface-sunken shadow-neu-inset text-text-primary"
                      : "text-text-secondary hover:bg-surface-sunken/50 hover:text-text-primary",
                  )}
                >
                  <Icon
                    size={18}
                    strokeWidth={active ? 2 : 1.75}
                    className="shrink-0"
                  />
                  {/* Label: скрыт на mobile, виден на desktop */}
                  <span className="hidden md:inline">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
