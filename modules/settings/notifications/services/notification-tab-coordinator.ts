"use client";

const CLAIM_TTL_MS = 60_000;
const memoryClaims = new Set<string>();

export function hasProcessedNotification(id: string): boolean {
  if (memoryClaims.has(id)) return true;
  try {
    return sessionStorage.getItem(`nevora:notification:processed:${id}`) === "1";
  } catch {
    return false;
  }
}

export async function claimNotification(id: string): Promise<boolean> {
  if (document.visibilityState !== "visible" || !document.hasFocus() || hasProcessedNotification(id)) return false;
  const claim = () => {
    const key = `nevora:notification:claim:${id}`;
    const now = Date.now();
    try {
      const previous = Number(localStorage.getItem(key));
      if (Number.isFinite(previous) && now - previous < CLAIM_TTL_MS) return false;
      localStorage.setItem(key, String(now));
      sessionStorage.setItem(`nevora:notification:processed:${id}`, "1");
    } catch {
      // Storage can be unavailable in private contexts; the in-memory guard still applies.
    }
    memoryClaims.add(id);
    return true;
  };

  if (navigator.locks?.request) {
    let claimed = false;
    await navigator.locks.request(`nevora:notification:${id}`, { ifAvailable: true }, (lock) => {
      claimed = Boolean(lock) && claim();
    });
    return claimed;
  }
  return claim();
}
