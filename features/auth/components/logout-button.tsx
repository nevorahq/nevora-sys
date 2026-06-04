"use client";

import { logoutAction } from "../actions/logout.action";
import { Button } from "@/shared/ui/button";

interface LogoutButtonProps {
  label: string;
}

export function LogoutButton({ label }: LogoutButtonProps) {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="ghost">
        {label}
      </Button>
    </form>
  );
}
