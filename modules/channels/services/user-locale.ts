import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOCALES, type Locale } from "@/shared/i18n/constants";

/** A channel client's IETF tag (`ru`, `ro`, `en-US`, …) → an app locale; English otherwise. */
export function localeFromLanguageCode(code: string | null | undefined): Locale {
  const base = code?.toLowerCase().split("-")[0];
  return LOCALES.find((locale) => locale === base) ?? "en";
}

/** The user's chosen app language (profiles.language), else `fallback`. */
export async function resolveUserLocale(supabase: SupabaseClient, userId: string, fallback: Locale): Promise<Locale> {
  const { data } = await supabase.from("profiles").select("language").eq("id", userId).maybeSingle();
  const language = (data as { language?: string } | null)?.language;
  return LOCALES.find((locale) => locale === language) ?? fallback;
}
