"use client";

import { useCallback, useState } from "react";
import { validateDocumentFiles } from "../services/validate-document-file";

export function useDocumentFiles() {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback((nextFiles: FileList | File[] | null) => {
    if (!nextFiles) return;
    setFiles((current) => {
      const merged = [...current, ...Array.from(nextFiles)];
      const validation = validateDocumentFiles(merged);
      if (!validation.ok) {
        setError(validation.message);
        return current;
      }
      setError(null);
      return merged;
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
    setError(null);
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setError(null);
  }, []);

  return { files, error, addFiles, removeFile, clearFiles };
}
