import type { ReactNode } from "react";
import { assertPausedModuleEnabled } from "@/shared/config/paused-modules";

/**
 * Booking is a paused module for the private beta. Guarding at the layout level
 * blocks every `/dashboard/booking/*` route (dashboard, requests, availability,
 * hosts, services) in one place, unless Booking has been explicitly re-enabled
 * for this environment.
 */
export default function BookingSectionLayout({ children }: { children: ReactNode }) {
  assertPausedModuleEnabled("booking");
  return children;
}
