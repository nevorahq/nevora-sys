"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * While an extraction is in flight (pending/processing), refresh the server
 * component periodically so the review card updates when the background
 * `after()` job finishes. Stops once a terminal state is reached or after a
 * bounded number of attempts (so a wedged job can't poll forever).
 */
const POLL_INTERVAL_MS = 2500;
const MAX_ATTEMPTS = 48; // ~2 minutes

export function ExtractionStatusPoller({ status }: { status: string }) {
  const router = useRouter();
  const attemptsRef = useRef(0);
  const active = status === "pending" || status === "processing";

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      attemptsRef.current += 1;
      if (attemptsRef.current > MAX_ATTEMPTS) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active, router]);

  return null;
}
