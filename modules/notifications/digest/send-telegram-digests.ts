import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { permissionsForRole } from "@/lib/auth/require-org";
import { logger } from "@/lib/observability/logger";
import { attentionPredicate, type AttentionFilterKey } from "@/modules/action-center/services/attention-filter";
import type { TelegramLinkButton } from "@/modules/channels/telegram/telegram-api";
import { ROUTES } from "@/shared/config/routes";
import { LOCALES, type Locale } from "@/shared/i18n/constants";
import { getDictionaryFor } from "@/shared/i18n/get-dictionary";
import { isWithinQuietHours } from "../preferences";
import { composeDigest, DIGEST_ITEM_LIMIT, type DigestCounts, type DigestItem } from "./compose-digest";
import {
  DEFAULT_DIGEST_HOUR,
  isInDigestWindow,
  localMoment,
  MAX_DIGEST_ATTEMPTS,
  resolveDigestTimezone,
} from "./digest-schedule";

/**
 * The hourly Telegram digest sweep (ADR 003, step 1).
 *
 * For every active Telegram link it decides whether this hour is the user's
 * digest hour, and if so sends one summary of their organization's Action
 * Center — overdue, due today, everything that needs attention — computed with
 * the same `attentionPredicate` the app uses. At most one digest per user,
 * organization and local day (`notification_digests` unique key), at most
 * `MAX_DIGEST_ATTEMPTS` tries, nothing on an empty day.
 *
 * Read-only towards the product: it writes only its own delivery log. The
 * service-role client is required (there is no session in a cron); every query
 * is scoped to the linked user's organization explicitly.
 */

const CHANNEL = "telegram";
const INTEGRATION_BATCH = 500;
const MISSING_SCHEMA = new Set(["PGRST205", "PGRST204", "42P01", "42703"]);

export interface DigestSweepDeps {
  supabase: SupabaseClient;
  now: Date;
  /** Absolute app origin, no trailing slash. */
  appUrl: string;
  send: (chatId: string, text: string, button?: TelegramLinkButton) => Promise<boolean>;
}

export interface DigestSweepResult {
  ok: boolean;
  migrationPending?: boolean;
  candidates: number;
  sent: number;
  failed: number;
  empty: number;
  /** Not this user's hour, quiet hours, switched off, already done today. */
  notDue: number;
  notMember: number;
}

interface IntegrationRow {
  organization_id: string;
  user_id: string;
  external_chat_id: string;
}

interface PreferenceRow {
  organization_id: string;
  user_id: string;
  telegram_digest_enabled: boolean;
  digest_hour: number;
  timezone: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

interface DigestRow {
  organization_id: string;
  user_id: string;
  status: "sent" | "skipped" | "failed";
  attempts: number;
}

const key = (organizationId: string, userId: string) => `${organizationId}:${userId}`;

export async function sendTelegramDigests(deps: DigestSweepDeps): Promise<DigestSweepResult> {
  const { supabase, now } = deps;
  const result: DigestSweepResult = { ok: true, candidates: 0, sent: 0, failed: 0, empty: 0, notDue: 0, notMember: 0 };

  // Tolerate the migration not being applied yet: report, don't throw.
  const probe = await supabase.from("notification_digests").select("id").limit(1);
  if (probe.error) {
    if (MISSING_SCHEMA.has(probe.error.code ?? "")) return { ...result, migrationPending: true };
    logger.error("notification.digest.probe_failed", { error: probe.error.message });
    return { ...result, ok: false };
  }

  const { data: integrations, error: integrationsError } = await supabase
    .from("channel_integrations")
    .select("organization_id, user_id, external_chat_id")
    .eq("channel", CHANNEL)
    .eq("status", "active")
    .not("external_chat_id", "is", null)
    .limit(INTEGRATION_BATCH);
  if (integrationsError) {
    logger.error("notification.digest.integrations_failed", { error: integrationsError.message });
    return { ...result, ok: false };
  }
  const links = (integrations ?? []) as IntegrationRow[];
  result.candidates = links.length;
  if (links.length === 0) return result;

  const userIds = [...new Set(links.map((link) => link.user_id))];
  const organizationIds = [...new Set(links.map((link) => link.organization_id))];

  const [preferencesResult, organizationsResult, membershipsResult, profilesResult] = await Promise.all([
    supabase
      .from("user_notification_preferences")
      .select("organization_id, user_id, telegram_digest_enabled, digest_hour, timezone, quiet_hours_enabled, quiet_hours_start, quiet_hours_end")
      .in("user_id", userIds),
    supabase.from("organizations").select("id, timezone").in("id", organizationIds),
    supabase.from("memberships").select("organization_id, user_id, role").in("user_id", userIds).eq("status", "active"),
    supabase.from("profiles").select("id, language").in("id", userIds),
  ]);
  if (preferencesResult.error) {
    if (MISSING_SCHEMA.has(preferencesResult.error.code ?? "")) return { ...result, migrationPending: true };
    logger.error("notification.digest.preferences_failed", { error: preferencesResult.error.message });
    return { ...result, ok: false };
  }

  const preferences = new Map(((preferencesResult.data ?? []) as PreferenceRow[]).map((row) => [key(row.organization_id, row.user_id), row]));
  const orgTimezone = new Map(((organizationsResult.data ?? []) as Array<{ id: string; timezone: string | null }>).map((row) => [row.id, row.timezone]));
  const roles = new Map(((membershipsResult.data ?? []) as Array<{ organization_id: string; user_id: string; role: string }>).map((row) => [key(row.organization_id, row.user_id), row.role]));
  const languages = new Map(((profilesResult.data ?? []) as Array<{ id: string; language: string | null }>).map((row) => [row.id, row.language]));

  for (const link of links) {
    const pref = preferences.get(key(link.organization_id, link.user_id));
    if (pref && !pref.telegram_digest_enabled) {
      result.notDue += 1;
      continue;
    }

    // Same resolution order as reminders: the user's notification timezone, then the organization's, then UTC.
    const timezone = resolveDigestTimezone(pref?.timezone, orgTimezone.get(link.organization_id));
    const moment = localMoment(now, timezone);
    const digestHour = pref?.digest_hour ?? DEFAULT_DIGEST_HOUR;
    if (!moment || !isInDigestWindow(moment.hour, digestHour)) {
      result.notDue += 1;
      continue;
    }
    if (
      pref &&
      isWithinQuietHours(now, {
        quietHoursEnabled: pref.quiet_hours_enabled,
        quietHoursStart: String(pref.quiet_hours_start),
        quietHoursEnd: String(pref.quiet_hours_end),
        timezone,
      })
    ) {
      result.notDue += 1;
      continue;
    }

    const { data: existingRow } = await supabase
      .from("notification_digests")
      .select("organization_id, user_id, status, attempts")
      .eq("organization_id", link.organization_id)
      .eq("user_id", link.user_id)
      .eq("channel", CHANNEL)
      .eq("local_date", moment.date)
      .maybeSingle();
    const existing = existingRow as DigestRow | null;
    if (existing && (existing.status !== "failed" || existing.attempts >= MAX_DIGEST_ATTEMPTS)) {
      result.notDue += 1;
      continue;
    }
    // Claim today's digest before doing anything visible, so two overlapping
    // runs can never both send it.
    if (!(await claim(supabase, link, moment.date, existing))) {
      result.notDue += 1;
      continue;
    }

    const role = roles.get(key(link.organization_id, link.user_id));
    if (!role || !permissionsForRole(role).has("action_center.view")) {
      await finalize(supabase, link, moment.date, { status: "skipped", reason: "not_member", itemCount: 0 });
      result.notMember += 1;
      continue;
    }

    const attention = await loadAttention(supabase, link.organization_id, now);
    if (!attention) {
      await finalize(supabase, link, moment.date, { status: "failed", reason: "attention_failed", itemCount: 0 });
      result.ok = false;
      continue;
    }

    const locale = toLocale(languages.get(link.user_id));
    const copy = getDictionaryFor(locale).channels.telegram.digest;
    const digest = composeDigest(attention.counts, attention.items, copy, `${deps.appUrl}${ROUTES.dashboard}`);
    if (!digest) {
      await finalize(supabase, link, moment.date, { status: "skipped", reason: "empty", itemCount: 0 });
      result.empty += 1;
      continue;
    }

    const button = digest.buttonUrl ? { label: digest.buttonLabel, url: digest.buttonUrl } : undefined;
    const delivered = await deps.send(link.external_chat_id, digest.text, button);
    await finalize(supabase, link, moment.date, delivered
      ? { status: "sent", reason: null, itemCount: digest.itemCount }
      : { status: "failed", reason: "send_failed", itemCount: digest.itemCount });
    if (delivered) result.sent += 1;
    else result.failed += 1;
  }

  return result;
}

function toLocale(language: string | null | undefined): Locale {
  return LOCALES.find((locale) => locale === language) ?? "en";
}

/** The Action Center view of one organization, through the app's own predicates. */
async function loadAttention(
  supabase: SupabaseClient,
  organizationId: string,
  now: Date,
): Promise<{ counts: DigestCounts; items: DigestItem[] } | null> {
  const count = async (filter: AttentionFilterKey): Promise<number | null> => {
    const predicate = attentionPredicate(filter, now);
    let query = supabase
      .from("action_items")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .in("status", predicate.statuses);
    if (predicate.dueRequired) query = query.not("due_at", "is", null);
    if (predicate.dueFrom) query = query.gte("due_at", predicate.dueFrom);
    if (predicate.dueBefore) query = query.lt("due_at", predicate.dueBefore);
    const { count: value, error } = await query;
    if (error) {
      logger.error("notification.digest.count_failed", { filter, error: error.message });
      return null;
    }
    return value ?? 0;
  };

  const active = attentionPredicate("needs_attention", now);
  const [overdue, dueToday, needsAttention, rows] = await Promise.all([
    count("overdue"),
    count("due_today"),
    count("needs_attention"),
    supabase
      .from("action_items")
      .select("title, due_at")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .in("status", active.statuses)
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(DIGEST_ITEM_LIMIT * 4),
  ]);
  if (overdue === null || dueToday === null || needsAttention === null || rows.error) return null;

  const todayFrom = attentionPredicate("due_today", now).dueFrom ?? "";
  const tomorrowFrom = attentionPredicate("due_today", now).dueBefore ?? "";
  const items: DigestItem[] = ((rows.data ?? []) as Array<{ title: string | null; due_at: string | null }>)
    .filter((row) => row.title && row.title.trim())
    .map((row) => ({
      title: row.title as string,
      bucket: !row.due_at ? "other" : row.due_at < todayFrom ? "overdue" : row.due_at < tomorrowFrom ? "today" : "other",
    }));

  return { counts: { overdue, dueToday, needsAttention }, items };
}

type Outcome =
  | { status: "sent"; reason: null; itemCount: number }
  | { status: "skipped"; reason: string; itemCount: number }
  | { status: "failed"; reason: string; itemCount: number };

/**
 * Take today's digest for this user: insert the row, or bump a failed one's
 * attempt counter with a compare-and-set. False when another run already holds
 * it (unique key / changed attempts) — the caller must then not send.
 */
async function claim(
  supabase: SupabaseClient,
  link: IntegrationRow,
  localDate: string,
  existing: DigestRow | null,
): Promise<boolean> {
  if (!existing) {
    const { error } = await supabase.from("notification_digests").insert({
      organization_id: link.organization_id,
      user_id: link.user_id,
      channel: CHANNEL,
      local_date: localDate,
      status: "failed",
      reason: "sending",
      attempts: 1,
    });
    return !error;
  }
  const { data, error } = await supabase
    .from("notification_digests")
    .update({ attempts: existing.attempts + 1, reason: "sending" })
    .eq("organization_id", link.organization_id)
    .eq("user_id", link.user_id)
    .eq("channel", CHANNEL)
    .eq("local_date", localDate)
    .eq("status", "failed")
    .eq("attempts", existing.attempts)
    .select("id");
  return !error && (data?.length ?? 0) === 1;
}

/** Record how the claimed digest ended. Never throws. */
async function finalize(
  supabase: SupabaseClient,
  link: IntegrationRow,
  localDate: string,
  outcome: Outcome,
): Promise<void> {
  const { error } = await supabase
    .from("notification_digests")
    .update({
      status: outcome.status,
      reason: outcome.reason,
      item_count: outcome.itemCount,
      sent_at: outcome.status === "sent" ? new Date().toISOString() : null,
    })
    .eq("organization_id", link.organization_id)
    .eq("user_id", link.user_id)
    .eq("channel", CHANNEL)
    .eq("local_date", localDate);
  if (error) logger.error("notification.digest.record_failed", { status: outcome.status, error: error.message });
}
