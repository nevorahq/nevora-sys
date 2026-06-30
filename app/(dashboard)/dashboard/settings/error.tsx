"use client";

import { useEffect } from "react";
import { Button } from "@/shared/ui/button";

export default function SettingsError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => { console.error("Settings route error:", error); }, [error]);
  return (
    <div className="soft-card-sm flex min-h-64 flex-col items-center justify-center px-6 text-center">
      <h2 className="text-lg font-semibold text-text-primary">Settings could not be loaded</h2>
      <p className="mt-1 text-sm text-text-muted">Try again. If the problem continues, check that the latest database migration has been applied.</p>
      <Button type="button" onClick={unstable_retry} className="mt-5">Try again</Button>
    </div>
  );
}
