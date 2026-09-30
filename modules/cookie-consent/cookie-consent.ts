/**
 * The visitor's analytics-cookie choice: whether PostHog is allowed to run.
 *
 * A cookie rather than localStorage, same as `nevora_locale`: it carries its
 * own expiry (a stale acceptance does not outlive `Max-Age` forever the way a
 * localStorage entry would), and it stays readable server-side later without a
 * second storage mechanism if that is ever needed.
 *
 * Nothing here imports PostHog. The banner writes the choice, `PostHogProvider`
 * reacts to it — either side can change without the other.
 */
export const CONSENT_COOKIE = "nevora_cookie_consent";

/** Long enough that returning visitors are not re-asked every session; short enough that a year-old acceptance expires on its own. */
export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type ConsentState = Readonly<{ analytics: boolean; updatedAt: string }>;

const consentListeners = new Set<(state: ConsentState | null) => void>();
const preferencesListeners = new Set<() => void>();

function canUseCookies() {
  return typeof document !== "undefined";
}

function cookieAttributes(maxAge: number) {
  const attributes = [`Max-Age=${maxAge}`, "Path=/", "SameSite=Lax"];
  if (typeof window !== "undefined" && window.location?.protocol === "https:") {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}

export function serializeConsent(state: ConsentState): string {
  return encodeURIComponent(JSON.stringify(state));
}

export function parseConsent(rawValue: string | null): ConsentState | null {
  if (!rawValue) return null;

  try {
    const data = JSON.parse(decodeURIComponent(rawValue));
    const updatedAtIsValid = typeof data?.updatedAt === "string" && !Number.isNaN(Date.parse(data.updatedAt));
    if (typeof data?.analytics !== "boolean" || !updatedAtIsValid) return null;

    return { analytics: data.analytics, updatedAt: data.updatedAt };
  } catch {
    return null;
  }
}

function readRawCookie(): string | null {
  if (!canUseCookies()) return null;

  const prefix = `${CONSENT_COOKIE}=`;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return match ? match.slice(prefix.length) : null;
}

function notifyConsentListeners(state: ConsentState | null) {
  for (const listener of consentListeners) listener(state);
}

export function loadConsent(): ConsentState | null {
  return parseConsent(readRawCookie());
}

export function saveConsent(analytics: boolean): ConsentState {
  const state: ConsentState = { analytics, updatedAt: new Date().toISOString() };

  if (canUseCookies()) {
    document.cookie = `${CONSENT_COOKIE}=${serializeConsent(state)}; ${cookieAttributes(CONSENT_COOKIE_MAX_AGE)}`;
  }

  notifyConsentListeners(state);
  return state;
}

export function clearConsent(): void {
  if (canUseCookies()) {
    document.cookie = `${CONSENT_COOKIE}=; ${cookieAttributes(0)}`;
  }
  notifyConsentListeners(null);
}

export function hasRespondedToConsent(): boolean {
  return loadConsent() !== null;
}

export function subscribeToConsent(callback: (state: ConsentState | null) => void): () => void {
  consentListeners.add(callback);
  return () => {
    consentListeners.delete(callback);
  };
}

/**
 * Asks the banner to show again so the visitor can change an earlier choice.
 * Withdrawing consent has to be as easy as giving it, so every "Cookie
 * settings" control funnels through here instead of owning banner state.
 */
export function openConsentPreferences(): void {
  for (const listener of preferencesListeners) listener();
}

export function subscribeToConsentPreferences(callback: () => void): () => void {
  preferencesListeners.add(callback);
  return () => {
    preferencesListeners.delete(callback);
  };
}
