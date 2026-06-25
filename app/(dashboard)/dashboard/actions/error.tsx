"use client";

/** Error boundary для Action Center (App Router требует client). */
export default function ActionsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="soft-card p-8 text-center">
      <h2 className="text-lg font-semibold text-text-primary">Couldn&apos;t load the Action Center</h2>
      <p className="mt-2 text-sm text-text-muted">{error.message || "An unexpected error occurred"}</p>
      <button
        onClick={reset}
        className="mt-4 rounded-(--neu-radius-pill) bg-surface-sunken px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        Try again
      </button>
    </div>
  );
}
