"use client";

import { createContext, useContext } from "react";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

export type ErrorCopy = Dictionary["errorBoundary"];

const ErrorCopyContext = createContext<ErrorCopy | null>(null);

/**
 * Next passes an error boundary only `error` and `reset`, so it cannot read the
 * dictionary itself. The server shell provides the localized copy here, and any
 * error.tsx rendered inside that shell reads it with `useErrorCopy`.
 */
export function ErrorCopyProvider({ copy, children }: { copy: ErrorCopy; children: React.ReactNode }) {
  return <ErrorCopyContext.Provider value={copy}>{children}</ErrorCopyContext.Provider>;
}

export function useErrorCopy(): ErrorCopy {
  const copy = useContext(ErrorCopyContext);
  if (!copy) throw new Error("useErrorCopy must be used inside ErrorCopyProvider");
  return copy;
}
