"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboardIcon, CheckSquareIcon, WalletIcon,
  FileTextIcon, SettingsIcon,
  InboxIcon,
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
  /**
   * Extra path prefixes that should light this item up as active, for surfaces
   * that were folded INTO this section but keep their own route. Subscriptions
   * folded into Money (Sprint 2 surface reduction): `/dashboard/subscriptions`
   * still resolves as a deep link, but in the nav it belongs to Money.
   */
  activeMatch?: string[];
}

interface SidebarProps {
  dict: Dictionary;
}

export function Sidebar({ dict }: SidebarProps) {
  const pathname = usePathname();

  // Sprint 2 surface reduction: the primary nav holds at most six sections.
  // Subscriptions folded INTO Money (its route still resolves and is reached from
  // the Money page), so it is no longer a standalone nav item.
  //
  // Inbox is the primary operating screen (post-auth landing). The Action Center
  // (`/dashboard`), Analytics and AI are temporarily hidden from the nav — their
  // pages still resolve by URL; this is a cosmetic hide, not a route gate. The
  // generic metrics roll-up sits further down as "Overview".
  //
  // CRM and Booking are PAUSED modules: they are absent here on purpose, and the
  // hiding is cosmetic only — `shared/config/paused-modules` gates their pages,
  // Server Actions and route handlers server-side.
  const navItems: NavItem[] = [
    { href: ROUTES.inbox,     label: dict.nav.inbox,     icon: InboxIcon },
    { href: ROUTES.tasks,     label: dict.nav.tasks,     icon: CheckSquareIcon },
    { href: ROUTES.money,     label: dict.nav.money,     icon: WalletIcon, activeMatch: [ROUTES.subscriptions] },
    { href: ROUTES.documents, label: dict.nav.documents, icon: FileTextIcon },
    { href: ROUTES.overview,  label: dict.nav.overview,  icon: LayoutDashboardIcon },
    { href: ROUTES.settings,  label: dict.nav.settings,  icon: SettingsIcon },
  ];

  function isActive(item: NavItem): boolean {
    if (pathname.startsWith(item.href)) return true;
    return (item.activeMatch ?? []).some((p) => pathname.startsWith(p));
  }

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-border-soft bg-surface",
        // Sticky: неподвижный при скролле, высота 100dvh, self-start чтобы
        // sticky работал (иначе flex-stretch растянул бы по высоте контента)
        "sticky top-0 self-start h-dvh",
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
      <nav className="flex-1 overflow-y-auto px-2 py-4 md:px-3">
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  // title — нативный tooltip, показывает label при hover на mobile
                  title={item.label}
                  className={cn(
                    "relative flex items-center rounded-(--neu-radius-md) text-sm font-medium transition-all duration-150",
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
