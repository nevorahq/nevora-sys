"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRingIcon, Code2Icon, CreditCardIcon, Layers3Icon, UserRoundIcon, UsersRoundIcon, Building2Icon } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import { cn } from "@/shared/utils/cn";

interface SidebarLabels {
  ariaLabel: string;
  profile: string;
  notifications: string;
  workspace: string;
  members: string;
  billing: string;
  plans: string;
  developer: string;
}

const ITEMS = [
  { href: ROUTES.settingsProfile, key: "profile", icon: UserRoundIcon, admin: false },
  { href: ROUTES.settingsNotifications, key: "notifications", icon: BellRingIcon, admin: false },
  { href: ROUTES.settingsWorkspace, key: "workspace", icon: Building2Icon, admin: true },
  { href: ROUTES.settingsMembers, key: "members", icon: UsersRoundIcon, admin: true },
  { href: ROUTES.settingsBilling, key: "billing", icon: CreditCardIcon, admin: true },
  { href: ROUTES.settingsPlans, key: "plans", icon: Layers3Icon, admin: false },
  { href: ROUTES.settingsDeveloper, key: "developer", icon: Code2Icon, admin: true },
] as const;

export function SettingsSidebar({ canAdminister, labels }: { canAdminister: boolean; labels: SidebarLabels }) {
  const pathname = usePathname();
  const items = ITEMS.filter((item) => canAdminister || !item.admin);

  return (
    <nav aria-label={labels.ariaLabel} className="md:w-52 md:shrink-0">
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
                {labels[item.key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
