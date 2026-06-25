/** Keeps text fields as strings while mapping only optional entity fields to null. */
export function normalizeDocumentUpdateFormData(formData: FormData): Record<string, FormDataEntryValue | null> {
  return Object.fromEntries(
    [...formData.entries()]
      .filter(([key]) => key !== "documentId")
      .map(([key, value]) => [
        key,
        (key === "entity_type" || key === "entity_id") && value === "" ? null : value,
      ]),
  );
}
