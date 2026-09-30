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
import { composeDigestEmail, type DigestEmail } from "./compose-digest-email";
import {
  DEFAULT_DIGEST_HOUR,
  isInDigestWindow,
  localMoment,
  MAX_DIGEST_ATTEMPTS,
  resolveDigestTimezone,
} from "./digest-schedule";

/**
 * The hourly digest sweeps (ADR 003): one summary of a user's Action Center a
 * day, outside the app — in the linked Telegram chat (step 1), or by email for
 * members without Telegram (step 2). Both channels share every rule here:
 *
 * - the user's `digest_hour` in their notification timezone (user → org → UTC),
 *   inside a three-hour window that never crosses midnight, never in quiet hours;
 * - counts from the Action Center's own `attentionPredicate`, so the numbers
 *   match the app;
 * - at most one digest per user, organization, channel and local day
 *   (`notification_digests` unique key), claimed BEFORE sending; at most
 *   `MAX_DIGEST_ATTEMPTS` tries; nothing on an empty day.
 *
 * Read-only towards the product: the sweep writes only its own delivery log.
 * The service-role client is required (no session in a cron); every query is
 * scoped to the recipient's organization explicitly.
 */

const RECIPIENT_BATCH = 500;
const MISSING_SCHEMA = new Set(["PGRST205", "PGRST204", "42P01", "42703"]);

type DigestChannel = "telegram" | "email";
type SwitchColumn = "telegram_digest_enabled" | "email_digest_enabled";

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
  /** Email only: the account has no email address. */
  noAddress: number;
}

interface Recipient {
  organization_id: string;
  user_id: string;
  /** Telegram chat id; null for email (resolved only when a digest is due). */
  address: string | null;
}

type DeliveryOutcome = { status: "sent" } | { status: "failed" | "skipped"; reason: string };

interface DeliveryInput {
  recipient: Recipient;
  counts: DigestCounts;
  items: DigestItem[];
  locale: Locale;
  organizationName: string;
}

interface ChannelAdapter {
  channel: DigestChannel;
  switchColumn: SwitchColumn;
  loadRecipients: (supabase: SupabaseClient) => Promise<Recipient[] | { error: string }>;
  deliver: (input: DeliveryInput) => Promise<DeliveryOutcome>;
}

interface CoreDeps {
  supabase: SupabaseClient;
  now: Date;
}

// ── Telegram (step 1) ───────────────────────────────────────────────────────

export interface TelegramDigestDeps extends CoreDeps {
  /** Absolute app origin, no trailing slash. */
  appUrl: string;
  send: (chatId: string, text: string, button?: TelegramLinkButton) => Promise<boolean>;
}

export function sendTelegramDigests(deps: TelegramDigestDeps): Promise<DigestSweepResult> {
  return runDigestSweep(deps, {
    channel: "telegram",
    switchColumn: "telegram_digest_enabled",
    loadRecipients: async (supabase) => {
      const { data, error } = await supabase
        .from("channel_integrations")
        .select("organization_id, user_id, external_chat_id")
        .eq("channel", "telegram")
        .eq("status", "active")
        .not("external_chat_id", "is", null)
        .limit(RECIPIENT_BATCH);
      if (error) return { error: error.message };
      return ((data ?? []) as Array<{ organization_id: string; user_id: string; external_chat_id: string }>).map((row) => ({
        organization_id: row.organization_id,
        user_id: row.user_id,
        address: row.external_chat_id,
      }));
    },
    deliver: async ({ recipient, counts, items, locale }) => {
      const copy = getDictionaryFor(locale).channels.telegram.digest;
      const digest = composeDigest(counts, items, copy, `${deps.appUrl}${ROUTES.dashboard}`);
      if (!digest || !recipient.address) return { status: "skipped", reason: "empty" };
      const button = digest.buttonUrl ? { label: digest.buttonLabel, url: digest.buttonUrl } : undefined;
      return (await deps.send(recipient.address, digest.text, button))
        ? { status: "sent" }
        : { status: "failed", reason: "send_failed" };
    },
  });
}

// ── Email (step 2) ──────────────────────────────────────────────────────────

export interface EmailDigestDeps extends CoreDeps {
  /** Absolute app origin, no trailing slash. */
  appUrl: string;
  /** The account's email address, or null when it has none. */
  getEmail: (userId: string) => Promise<string | null>;
  send: (to: string, email: DigestEmail) => Promise<boolean>;
}

/**
 * The same digest by email, for active members WITHOUT an active Telegram link
 * in that organization — a user never gets both.
 */
export function sendEmailDigests(deps: EmailDigestDeps): Promise<DigestSweepResult> {
  return runDigestSweep(deps, {
    channel: "email",
    switchColumn: "email_digest_enabled",
    loadRecipients: async (supabase) => {
      const [memberships, telegramLinks] = await Promise.all([
        supabase.from("memberships").select("organization_id, user_id").eq("status", "active").limit(RECIPIENT_BATCH),
        supabase.from("channel_integrations").select("organization_id, user_id").eq("channel", "telegram").eq("status", "active"),
      ]);
      if (memberships.error) return { error: memberships.error.message };
      if (telegramLinks.error) return { error: telegramLinks.error.message };
      const linked = new Set(
        ((telegramLinks.data ?? []) as Array<{ organization_id: string; user_id: string }>).map((row) => key(row.organization_id, row.user_id)),
      );
      return ((memberships.data ?? []) as Array<{ organization_id: string; user_id: string }>)
        .filter((row) => !linked.has(key(row.organization_id, row.user_id)))
        .map((row) => ({ organization_id: row.organization_id, user_id: row.user_id, address: null }));
    },
    deliver: async ({ recipient, counts, items, locale, organizationName }) => {
      const to = await deps.getEmail(recipient.user_id);
      if (!to) return { status: "skipped", reason: "no_address" };
      const dict = getDictionaryFor(locale);
      const email = composeDigestEmail(counts, items, {
        digest: dict.channels.telegram.digest,
        email: dict.channels.email.digest,
        locale,
        organizationName,
        actionCenterUrl: `${deps.appUrl}${ROUTES.dashboard}`,
        settingsUrl: `${deps.appUrl}${ROUTES.settingsNotifications}`,
      });
      if (!email) return { status: "skipped", reason: "empty" };
      return (await deps.send(to, email)) ? { status: "sent" } : { status: "failed", reason: "send_failed" };
    },
  });
}

// ── The shared sweep ────────────────────────────────────────────────────────

interface PreferenceRow {
  organization_id: string;
  user_id: string;
  digest_hour: number;
  timezone: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  [switchColumn: string]: unknown;
}

interface DigestRow {
  status: "sent" | "skipped" | "failed";
  attempts: number;
}

const key = (organizationId: string, userId: string) => `${organizationId}:${userId}`;

async function runDigestSweep(deps: CoreDeps, adapter: ChannelAdapter): Promise<DigestSweepResult> {
  const { supabase, now } = deps;
  const result: DigestSweepResult = { ok: true, candidates: 0, sent: 0, failed: 0, empty: 0, notDue: 0, notMember: 0, noAddress: 0 };

  // Tolerate the migration not being applied yet: report, don't throw.
  const probe = await supabase.from("notification_digests").select("id").limit(1);
  if (probe.error) {
    if (MISSING_SCHEMA.has(probe.error.code ?? "")) return { ...result, migrationPending: true };
    logger.error("notification.digest.probe_failed", { channel: adapter.channel, error: probe.error.message });
    return { ...result, ok: false };
  }

  const loaded = await adapter.loadRecipients(supabase);
  if (!Array.isArray(loaded)) {
    logger.error("notification.digest.recipients_failed", { channel: adapter.channel, error: loaded.error });
    return { ...result, ok: false };
  }
  result.candidates = loaded.length;
  if (loaded.length === 0) return result;

  const userIds = [...new Set(loaded.map((recipient) => recipient.user_id))];
  const organizationIds = [...new Set(loaded.map((recipient) => recipient.organization_id))];

  const [preferencesResult, organizationsResult, membershipsResult, profilesResult] = await Promise.all([
    supabase
      .from("user_notification_preferences")
      .select(`organization_id, user_id, ${adapter.switchColumn}, digest_hour, timezone, quiet_hours_enabled, quiet_hours_start, quiet_hours_end`)
      .in("user_id", userIds),
    supabase.from("organizations").select("id, name, timezone").in("id", organizationIds),
    supabase.from("memberships").select("organization_id, user_id, role").in("user_id", userIds).eq("status", "active"),
    supabase.from("profiles").select("id, language").in("id", userIds),
  ]);
  if (preferencesResult.error) {
    if (MISSING_SCHEMA.has(preferencesResult.error.code ?? "")) return { ...result, migrationPending: true };
    logger.error("notification.digest.preferences_failed", { channel: adapter.channel, error: preferencesResult.error.message });
    return { ...result, ok: false };
  }

  const preferences = new Map(((preferencesResult.data ?? []) as unknown as PreferenceRow[]).map((row) => [key(row.organization_id, row.user_id), row]));
  const organizations = new Map(
    ((organizationsResult.data ?? []) as Array<{ id: string; name: string | null; timezone: string | null }>).map((row) => [row.id, row]),
  );
  const roles = new Map(
    ((membershipsResult.data ?? []) as Array<{ organization_id: string; user_id: string; role: string }>).map((row) => [key(row.organization_id, row.user_id), row.role]),
  );
  const languages = new Map(((profilesResult.data ?? []) as Array<{ id: string; language: string | null }>).map((row) => [row.id, row.language]));

  for (const recipient of loaded) {
    const pref = preferences.get(key(recipient.organization_id, recipient.user_id));
    if (pref && pref[adapter.switchColumn] === false) {
      result.notDue += 1;
      continue;
    }

    const organization = organizations.get(recipient.organization_id);
    // Same resolution order as reminders: the user's notification timezone, then the organization's, then UTC.
    const timezone = resolveDigestTimezone(pref?.timezone, organization?.timezone);
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
      .select("status, attempts")
      .eq("organization_id", recipient.organization_id)
      .eq("user_id", recipient.user_id)
      .eq("channel", adapter.channel)
      .eq("local_date", moment.date)
      .maybeSingle();
    const existing = existingRow as DigestRow | null;
    if (existing && (existing.status !== "failed" || existing.attempts >= MAX_DIGEST_ATTEMPTS)) {
      result.notDue += 1;
      continue;
    }
    // Claim today's digest before doing anything visible, so two overlapping
    // runs can never both send it.
    const slot = { ...recipient, channel: adapter.channel, localDate: moment.date };
    if (!(await claim(supabase, slot, existing))) {
      result.notDue += 1;
      continue;
    }

    const role = roles.get(key(recipient.organization_id, recipient.user_id));
    if (!role || !permissionsForRole(role).has("action_center.view")) {
      await finalize(supabase, slot, { status: "skipped", reason: "not_member", itemCount: 0 });
      result.notMember += 1;
      continue;
    }

    const attention = await loadAttention(supabase, recipient.organization_id, now);
    if (!attention) {
      await finalize(supabase, slot, { status: "failed", reason: "attention_failed", itemCount: 0 });
      result.ok = false;
      continue;
    }
    if (attention.counts.needsAttention <= 0) {
      await finalize(supabase, slot, { status: "skipped", reason: "empty", itemCount: 0 });
      result.empty += 1;
      continue;
    }

    const outcome = await adapter.deliver({
      recipient,
      counts: attention.counts,
      items: attention.items,
      locale: toLocale(languages.get(recipient.user_id)),
      organizationName: organization?.name ?? "Nevora",
    });
    const itemCount = attention.counts.needsAttention;
    if (outcome.status === "sent") {
      await finalize(supabase, slot, { status: "sent", reason: null, itemCount });
      result.sent += 1;
    } else if (outcome.status === "skipped") {
      await finalize(supabase, slot, { status: "skipped", reason: outcome.reason, itemCount: 0 });
      if (outcome.reason === "no_address") result.noAddress += 1;
      else result.empty += 1;
    } else {
      await finalize(supabase, slot, { status: "failed", reason: outcome.reason, itemCount });
      result.failed += 1;
    }
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

  const today = attentionPredicate("due_today", now);
  const todayFrom = today.dueFrom ?? "";
  const tomorrowFrom = today.dueBefore ?? "";
  const items: DigestItem[] = ((rows.data ?? []) as Array<{ title: string | null; due_at: string | null }>)
    .filter((row) => row.title && row.title.trim())
    .map((row) => ({
      title: row.title as string,
      bucket: !row.due_at ? "other" : row.due_at < todayFrom ? "overdue" : row.due_at < tomorrowFrom ? "today" : "other",
    }));

  return { counts: { overdue, dueToday, needsAttention }, items };
}

interface Slot {
  organization_id: string;
  user_id: string;
  channel: DigestChannel;
  localDate: string;
}

type Outcome =
  | { status: "sent"; reason: null; itemCount: number }
  | { status: "skipped"; reason: string; itemCount: number }
  | { status: "failed"; reason: string; itemCount: number };

/**
 * Take today's digest for this user and channel: insert the row, or bump a
 * failed one's attempt counter with a compare-and-set. False when another run
 * already holds it (unique key / changed attempts) — the caller must not send.
 */
async function claim(supabase: SupabaseClient, slot: Slot, existing: DigestRow | null): Promise<boolean> {
  if (!existing) {
    const { error } = await supabase.from("notification_digests").insert({
      organization_id: slot.organization_id,
      user_id: slot.user_id,
      channel: slot.channel,
      local_date: slot.localDate,
      status: "failed",
      reason: "sending",
      attempts: 1,
    });
    return !error;
  }
  const { data, error } = await supabase
    .from("notification_digests")
    .update({ attempts: existing.attempts + 1, reason: "sending" })
    .eq("organization_id", slot.organization_id)
    .eq("user_id", slot.user_id)
    .eq("channel", slot.channel)
    .eq("local_date", slot.localDate)
    .eq("status", "failed")
    .eq("attempts", existing.attempts)
    .select("id");
  return !error && (data?.length ?? 0) === 1;
}

/** Record how the claimed digest ended. Never throws. */
async function finalize(supabase: SupabaseClient, slot: Slot, outcome: Outcome): Promise<void> {
  const { error } = await supabase
    .from("notification_digests")
    .update({
      status: outcome.status,
      reason: outcome.reason,
      item_count: outcome.itemCount,
      sent_at: outcome.status === "sent" ? new Date().toISOString() : null,
    })
    .eq("organization_id", slot.organization_id)
    .eq("user_id", slot.user_id)
    .eq("channel", slot.channel)
    .eq("local_date", slot.localDate);
  if (error) logger.error("notification.digest.record_failed", { channel: slot.channel, status: outcome.status, error: error.message });
}
