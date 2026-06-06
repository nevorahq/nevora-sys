"use client";

import { LogOutIcon } from "lucide-react";
import { logoutAction } from "../actions/logout.action";
import { Button } from "@/shared/ui/button";

interface LogoutButtonProps {
  label: string;
}

export function LogoutButton({ label }: LogoutButtonProps) {
  return (
    <form action={logoutAction}>
      {/* Mobile: soft-icon-button 36×36 (как Notifications, Theme, Language) */}
      <button
        type="submit"
        aria-label={label}
        className="soft-icon-button w-9 h-9 md:hidden"
      >
        <LogOutIcon size={18} strokeWidth={1.75} />
      </button>

      {/* Desktop: текстовая ghost-кнопка */}
      <Button
        type="submit"
        variant="ghost"
        aria-label={label}
        className="hidden md:inline-flex"
      >
        {label}
      </Button>
    </form>
  );
}
