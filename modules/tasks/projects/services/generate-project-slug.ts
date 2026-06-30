import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// Combining diacritical marks (U+0300–U+036F) left over after NFKD normalize.
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Turn a project name into a URL-safe base slug. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return base || "project";
}

/**
 * Produce a slug unique within the workspace among live (non-archived) projects.
 *
 * The DB has a partial unique index on (workspace_id, slug); this pre-check
 * keeps user-facing errors friendly and avoids a 23505 round-trip on the happy
 * path. The index remains the real guard against races.
 */
export async function generateUniqueProjectSlug(
  supabase: SupabaseClient,
  workspaceId: string,
  name: string,
): Promise<string> {
  const base = slugify(name);

  const { data } = await supabase
    .from("projects")
    .select("slug")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .ilike("slug", `${base}%`);

  const taken = new Set((data ?? []).map((r) => r.slug as string));
  if (!taken.has(base)) return base;

  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }

  // Extremely unlikely fallback: random suffix.
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}
