"use client";

import { useEffect, useRef, useState } from "react";
import { BellIcon, CheckSquareIcon, FileTextIcon, ListChecksIcon, RepeatIcon, WalletIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/shared/utils/cn";
import { ROUTES } from "@/shared/config/routes";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { useNotificationIndicator } from "@/modules/notifications/components/notification-provider";
import type { UserNotification } from "@/modules/notifications/types";

interface NotificationsProps {
  dict: Dictionary;
}

export function Notifications({ dict }: NotificationsProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { unreadCount, notifications, markAllAsRead, markAsRead } = useNotificationIndicator();

  const n = dict.notifications;

  /* Close on click outside */
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  /* Close on Escape */
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `${n.label}, ${unreadCount} unread` : n.label}
        aria-expanded={open}
        aria-haspopup="true"
        className="soft-icon-button relative w-9 h-9"
      >
        <BellIcon size={18} strokeWidth={1.75} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="dialog"
          aria-label={n.label}
          className={cn(
            "z-50 soft-card p-0 overflow-hidden",
            // Mobile: фиксированное по центру viewport
            "fixed left-1/2 -translate-x-1/2 top-16 w-[calc(100vw-2rem)]",
            // Desktop: абсолютное, прижато к правому краю кнопки
            "md:absolute md:left-auto md:translate-x-0 md:right-0 md:top-11 md:w-72",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
            <p className="text-sm font-semibold text-text-primary">{n.label}</p>
            {unreadCount > 0 && <button type="button" onClick={() => void markAllAsRead()} className="text-xs font-medium text-accent-green hover:underline">Mark all as read ({unreadCount > 99 ? "99+" : unreadCount})</button>}
          </div>

          {/* Items */}
          <div className="flex max-h-[60vh] flex-col overflow-y-auto">
            {notifications.length === 0 && (
              <p className="px-4 py-5 text-sm text-center text-text-muted">{n.empty}</p>
            )}

            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onOpen={() => {
                  setOpen(false);
                  void markAsRead(notification.id);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({ notification, onOpen }: { notification: UserNotification; onOpen(): void }) {
  const Icon = NOTIFICATION_ICON[notification.category] ?? ListChecksIcon;
  const iconClass = NOTIFICATION_ICON_CLASS[notification.category] ?? "bg-info-soft text-info";

  return (
    <Link
      href={notification.target_url ?? ROUTES.actions}
      onClick={onOpen}
      className="flex items-start gap-3 border-b border-border-soft px-4 py-3 transition-colors hover:bg-surface-sunken last:border-none"
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-(--neu-radius-md) ${iconClass}`}>
        <Icon size={15} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{notification.title}</p>
        {notification.body && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-text-muted">{notification.body}</p>
        )}
        <p className="mt-1 text-[11px] text-text-tertiary">
          {new Date(notification.created_at).toLocaleString()}
        </p>
      </div>
    </Link>
  );
}

const NOTIFICATION_ICON = {
  task: CheckSquareIcon,
  subscription: RepeatIcon,
  payment: WalletIcon,
  document: FileTextIcon,
  action_center: ListChecksIcon,
};

const NOTIFICATION_ICON_CLASS = {
  task: "bg-danger-soft text-danger",
  subscription: "bg-accent-yellow-soft text-accent-yellow",
  payment: "bg-accent-green-soft text-accent-green",
  document: "bg-info-soft text-info",
  action_center: "bg-surface-sunken text-text-secondary",
};
