"use client";

export type BrowserNotificationState = "unsupported" | NotificationPermission;

export function getBrowserNotificationState(): BrowserNotificationState {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new Uint8Array(bytes.buffer);
}

export async function subscribeBrowser(publicKey: string): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}

export function safeNotificationTarget(value: unknown): string {
  return typeof value === "string" && value.startsWith("/dashboard/") && !value.startsWith("//")
    ? value
    : "/dashboard/actions";
}
