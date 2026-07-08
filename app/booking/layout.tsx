import type { ReactNode } from "react";
import { assertPausedModuleEnabled } from "@/shared/config/paused-modules";

/**
 * Booking is a paused module for the private beta — including its PUBLIC surface.
 *
 * Guarding at the layout level blocks every `/booking/*` route (organization page,
 * host page) in one place. Without this, an organization that had published a
 * booking page before the pause would keep serving it to anonymous visitors, so
 * Booking would still be a live, publicly marketed product surface.
 *
 * Mirrors the dashboard-side guard in `app/(dashboard)/dashboard/booking/layout.tsx`.
 */
export default function PublicBookingLayout({ children }: { children: ReactNode }) {
  assertPausedModuleEnabled("booking");
  return children;
}
