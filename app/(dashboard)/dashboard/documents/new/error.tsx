"use client";
export default function NewDocumentError({ reset }: { error: Error; reset: () => void }) {
  return <div className="soft-card mx-auto max-w-lg p-6 text-center"><h2 className="text-lg font-semibold text-text-primary">Couldn’t open the form</h2><p className="mt-2 text-sm text-text-muted">Please try again.</p><button onClick={reset} className="mt-5 text-sm font-semibold text-text-primary underline">Try again</button></div>;
}
