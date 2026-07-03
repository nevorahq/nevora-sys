"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRingIcon, Code2Icon, CreditCardIcon, Layers3Icon, UserRoundIcon, UsersRoundIcon, Building2Icon } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import { cn } from "@/shared/utils/cn";

const ITEMS = [
  { href: ROUTES.settingsProfile, label: "Profile", icon: UserRoundIcon, admin: false },
  { href: ROUTES.settingsNotifications, label: "Notifications", icon: BellRingIcon, admin: false },
  { href: ROUTES.settingsWorkspace, label: "Workspace", icon: Building2Icon, admin: true },
  { href: ROUTES.settingsMembers, label: "Members", icon: UsersRoundIcon, admin: true },
  { href: ROUTES.settingsBilling, label: "Billing", icon: CreditCardIcon, admin: true },
  { href: ROUTES.settingsPlans, label: "Plans", icon: Layers3Icon, admin: false },
  { href: ROUTES.settingsDeveloper, label: "Developer", icon: Code2Icon, admin: true },
] as const;

export function SettingsSidebar({ canAdminister }: { canAdminister: boolean }) {
  const pathname = usePathname();
  const items = ITEMS.filter((item) => canAdminister || !item.admin);

  return (
    <nav aria-label="Settings navigation" className="md:w-52 md:shrink-0">
      <ul className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-(--neu-radius-md) px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-surface-sunken text-text-primary shadow-neu-inset"
                    : "text-text-secondary hover:bg-surface-sunken/50 hover:text-text-primary",
                )}
              >
                <Icon size={17} aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
