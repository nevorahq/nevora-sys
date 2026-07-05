"use client";

import { useEffect, useRef } from "react";
import { useNotificationIndicator } from "@/modules/notifications/components/notification-provider";
import { markActionsSeenAction } from "../actions/mark-actions-seen.action";

/**
 * Invisible companion for the Action Center page. On mount it marks the log as
 * "seen" (resetting the unseen-event badge) and refreshes the sidebar counters.
 * Runs once per mount — opening the page clears the badge.
 */
export function MarkActionsSeen() {
  const { refreshCounters } = useNotificationIndicator();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void markActionsSeenAction().then((result) => {
      if (result.ok) refreshCounters();
    });
  }, [refreshCounters]);

  return null;
}
