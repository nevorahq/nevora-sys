"use client";

/**
 * Root error boundary (Phase 7.5).
 *
 * `global-error.tsx` replaces the root layout when an error is thrown above the
 * dashboard boundaries (e.g. in the root layout itself), so it must render its
 * own <html>/<body>. It NEVER shows the raw error — only friendly copy and the
 * `digest`, a short reference the user can quote to support; the full error is in
 * the server logs, correlated by that digest.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
          <div style={{ maxWidth: "28rem", textAlign: "center" }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
              Something went wrong
            </h2>
            <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", opacity: 0.7 }}>
              An unexpected error occurred. Please try again — if it keeps
              happening, contact support with the reference below.
            </p>
            {error.digest ? (
              <p style={{ marginTop: "0.75rem", fontSize: "0.75rem", opacity: 0.5 }}>
                Reference: <code>{error.digest}</code>
              </p>
            ) : null}
            <button
              onClick={reset}
              style={{ marginTop: "1.5rem", padding: "0.625rem 1.5rem", borderRadius: "9999px", border: "none", background: "#111", color: "#fff", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
