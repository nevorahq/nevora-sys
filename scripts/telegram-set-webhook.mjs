#!/usr/bin/env node
/**
 * Register (or inspect / remove) the Telegram capture bot's webhook.
 *
 *   node scripts/telegram-set-webhook.mjs https://app.example.com   # set
 *   node scripts/telegram-set-webhook.mjs --info                      # inspect
 *   node scripts/telegram-set-webhook.mjs --delete                    # remove
 *
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from the environment
 * (e.g. `set -a; source .env.local; set +a` first). Telegram then calls
 * <origin>/api/channels/telegram/webhook with the secret in the
 * X-Telegram-Bot-Api-Secret-Token header. Only `message` updates are requested:
 * the bot never receives edits, reactions or group traffic it does not handle.
 * The token is never printed.
 */
const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const arg = process.argv[2];

if (!token) fail("TELEGRAM_BOT_TOKEN is not set.");

const api = (method, body) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }).then((response) => response.json());

if (arg === "--info") {
  const info = await api("getWebhookInfo");
  print(info.result ?? info);
} else if (arg === "--delete") {
  print(await api("deleteWebhook", { drop_pending_updates: false }));
} else {
  if (!secret) fail("TELEGRAM_WEBHOOK_SECRET is not set.");
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) fail("TELEGRAM_WEBHOOK_SECRET may contain only A-Z, a-z, 0-9, _ and -.");
  let origin;
  try {
    origin = new URL(arg ?? process.env.NEXT_PUBLIC_APP_URL ?? "");
  } catch {
    fail("Pass the public https origin, e.g. https://app.example.com");
  }
  if (origin.protocol !== "https:") fail("Telegram requires an https webhook URL.");
  const url = new URL("/api/channels/telegram/webhook", origin).toString();
  const result = await api("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
  print({ url, ...result });
  const me = await api("getMe");
  if (me.ok) console.log(`Bot: @${me.result.username} — set TELEGRAM_BOT_USERNAME=${me.result.username}`);
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
