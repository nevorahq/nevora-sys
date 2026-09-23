"use client";

import { LogOutIcon } from "lucide-react";
import { logoutAction } from "../actions/logout.action";

interface LogoutButtonProps {
  label: string;
}

export function LogoutButton({ label }: LogoutButtonProps) {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        aria-label={label}
        title={label}
        className="soft-icon-button h-9 w-9"
      >
        <LogOutIcon size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </form>
  );
}
