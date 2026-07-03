"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/shared/ui/toast";
import { EMPTY_NOTIFICATION_COUNTERS, type NotificationCounters, type NotificationPreferences, type UserNotification } from "../types";
import { normalizeUnreadCount } from "../unread-count";
import { shouldPlaySound } from "../preferences";
import { shouldApplyUnreadCountResponse } from "../services/fetch-unread-notification-count";
import { fetchNotificationCounters } from "../services/fetch-notification-counters";
import { BrowserTitleManager } from "../services/browser-title-manager";
import { FaviconBadgeManager } from "../services/favicon-badge-manager";
import {
  NOTIFICATION_COUNT_CHANNEL,
  NOTIFICATION_COUNT_STORAGE_KEY,
  parseNotificationCountMessage,
  shouldAcceptNotificationCountMessage,
  type NotificationCountMessage,
} from "../services/notification-tab-sync";
import { markAllNotificationsAsRead } from "../actions/notification-read.actions";
import { NOTIFICATION_PREFERENCES_EVENT } from "../events";
import { claimNotification } from "@/modules/settings/notifications/services/notification-tab-coordinator";
import { isNotificationAudioUnlocked, playNotificationSound } from "@/modules/settings/notifications/services/notification-sound";

interface NotificationIndicatorContextValue {
  unreadCount: number;
  counters: NotificationCounters;
  markAllAsRead(): Promise<void>;
}

const NotificationIndicatorContext = createContext<NotificationIndicatorContextValue>({
  unreadCount: 0,
  counters: EMPTY_NOTIFICATION_COUNTERS,
  markAllAsRead: async () => undefined,
});

export function useNotificationIndicator(): NotificationIndicatorContextValue {
  return useContext(NotificationIndicatorContext);
}

export function NotificationProvider({
  organizationId,
  userId,
  initialPreferences,
  initialUnreadCount,
  initialCounters,
  children,
}: {
  organizationId: string;
  userId: string;
  initialPreferences: NotificationPreferences;
  initialUnreadCount?: number;
  initialCounters?: NotificationCounters;
  children: React.ReactNode;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [counters, setCounters] = useState<NotificationCounters>(() => initialCounters ?? {
    ...EMPTY_NOTIFICATION_COUNTERS,
    unread: normalizeUnreadCount(initialUnreadCount),
  });
  const unreadCount = counters.unread;
  const preferencesRef = useRef(initialPreferences);
  const unreadCountRef = useRef(unreadCount);
  const countersRef = useRef(counters);
  const updatedAtRef = useRef(0);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const titleManagerRef = useRef<BrowserTitleManager | null>(null);
  const faviconManagerRef = useRef<FaviconBadgeManager | null>(null);
  const refreshCountRef = useRef<() => void>(() => undefined);
  const dismiss = useCallback(() => setMessage(null), []);

  const applyCount = useCallback((value: number, updatedAt: number, broadcast: boolean) => {
    const count = normalizeUnreadCount(value);
    if (updatedAt < updatedAtRef.current) return;
    updatedAtRef.current = updatedAt;
    unreadCountRef.current = count;
    countersRef.current = { ...countersRef.current, unread: count };
    setCounters(countersRef.current);
    if (!broadcast) return;
    const payload: NotificationCountMessage = {
      type: "unread-count-updated",
      userId,
      organizationId,
      unreadCount: count,
      updatedAt,
    };
    broadcastRef.current?.postMessage(payload);
    try {
      localStorage.setItem(NOTIFICATION_COUNT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // BroadcastChannel remains the preferred path; storage can be unavailable.
    }
  }, [organizationId, userId]);

  const publishAuthoritativeCount = useCallback((value: number) => {
    const timestamp = Math.max(Date.now(), updatedAtRef.current + 1);
    applyCount(value, timestamp, true);
  }, [applyCount]);

  const publishAuthoritativeCounters = useCallback((next: NotificationCounters, broadcast = true) => {
    const timestamp = Math.max(Date.now(), updatedAtRef.current + 1);
    updatedAtRef.current = timestamp;
    countersRef.current = next;
    unreadCountRef.current = next.unread;
    setCounters(next);
    if (!broadcast) return;
    const payload: NotificationCountMessage = { type: "unread-count-updated", userId, organizationId, unreadCount: next.unread, updatedAt: timestamp };
    broadcastRef.current?.postMessage(payload);
    try { localStorage.setItem(NOTIFICATION_COUNT_STORAGE_KEY, JSON.stringify(payload)); } catch { /* optional fallback */ }
  }, [organizationId, userId]);

  useEffect(() => {
    const update = (event: Event) => {
      preferencesRef.current = (event as CustomEvent<NotificationPreferences>).detail;
      refreshCountRef.current();
    };
    window.addEventListener(NOTIFICATION_PREFERENCES_EVENT, update);
    return () => window.removeEventListener(NOTIFICATION_PREFERENCES_EVENT, update);
  }, []);

  useEffect(() => {
    updatedAtRef.current = Date.now();
    const receive = (value: unknown) => {
      const incoming = parseNotificationCountMessage(value);
      if (!incoming || !shouldAcceptNotificationCountMessage(incoming, {
        userId,
        organizationId,
        updatedAt: updatedAtRef.current,
      })) return;
      // Cross-tab state is a signal, never a second source of truth. A fresh
      // RPC also avoids clock races between simultaneous writers in two tabs.
      updatedAtRef.current = incoming.updatedAt;
      refreshCountRef.current();
    };
    const channel = typeof BroadcastChannel === "function"
      ? new BroadcastChannel(NOTIFICATION_COUNT_CHANNEL)
      : null;
    broadcastRef.current = channel;
    if (channel) channel.onmessage = (event) => receive(event.data);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== NOTIFICATION_COUNT_STORAGE_KEY || !event.newValue) return;
      try { receive(JSON.parse(event.newValue)); } catch { /* ignore malformed cross-tab state */ }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      channel?.close();
      if (broadcastRef.current === channel) broadcastRef.current = null;
    };
  }, [applyCount, organizationId, userId]);

  useEffect(() => {
    const titleManager = new BrowserTitleManager(document);
    const faviconManager = new FaviconBadgeManager(document);
    titleManagerRef.current = titleManager;
    faviconManagerRef.current = faviconManager;
    let frame = 0;
    const applyPresentation = () => {
      // Tab title stays plain route text (no "(N)"/"(N!)" badge). Passing zero counts
      // keeps the manager stripping any stray prefix while never adding one. The
      // favicon and the in-app bell carry the unread/urgent indicator instead.
      titleManager.apply(0, 0);
      void faviconManager.apply(countersRef.current.urgent > 0 ? countersRef.current.urgent : unreadCountRef.current);
    };
    const observer = new MutationObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(applyPresentation);
    });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href"] });
    applyPresentation();
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      titleManager.restore();
      faviconManager.restore();
      titleManagerRef.current = null;
      faviconManagerRef.current = null;
    };
  }, []);

  useEffect(() => {
    titleManagerRef.current?.apply(0, 0);
    void faviconManagerRef.current?.apply(counters.urgent > 0 ? counters.urgent : counters.unread);
  }, [counters]);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    let debounceTimer: number | undefined;
    let latestRequestId = 0;
    const refreshCount = () => {
      const requestId = ++latestRequestId;
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(async () => {
        const next = await fetchNotificationCounters(supabase, organizationId);
        if (next !== null && shouldApplyUnreadCountResponse(requestId, latestRequestId, mounted)) {
          publishAuthoritativeCounters(next);
        }
      }, 150);
    };
    refreshCountRef.current = refreshCount;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshCount();
    };
    window.addEventListener("focus", refreshCount);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const channel = supabase
      .channel(`notification-tab:${organizationId}:${userId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `organization_id=eq.${organizationId}`,
      }, async (payload) => {
        refreshCount();
        if (payload.eventType !== "INSERT") return;
        const notification = payload.new as UserNotification;
        if (notification.organization_id !== organizationId || notification.user_id !== userId) return;
        setMessage(notification.body ? `${notification.title}: ${notification.body}` : notification.title);
        const preferences = preferencesRef.current;
        if (!shouldPlaySound(preferences, notification.category, notification.priority) || !isNotificationAudioUnlocked()) return;
        if (!(await claimNotification(notification.id))) return;
        try {
          await playNotificationSound(preferences.soundVolume);
        } catch {
          // Title/toast delivery remains useful if audio playback later fails.
        }
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "action_items",
        filter: `organization_id=eq.${organizationId}`,
      }, refreshCount)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refreshCount();
      });
    const interval = window.setInterval(refreshCount, 60_000);

    return () => {
      mounted = false;
      latestRequestId += 1;
      refreshCountRef.current = () => undefined;
      window.clearTimeout(debounceTimer);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshCount);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [organizationId, publishAuthoritativeCounters, userId]);

  const markAllAsRead = useCallback(async () => {
    const result = await markAllNotificationsAsRead();
    if (result.ok) {
      publishAuthoritativeCount(result.unreadCount);
    } else {
      setMessage("Could not mark notifications as read. Please try again.");
    }
  }, [publishAuthoritativeCount]);

  const contextValue = useMemo(() => ({ unreadCount, counters, markAllAsRead }), [markAllAsRead, counters, unreadCount]);

  return (
    <NotificationIndicatorContext.Provider value={contextValue}>
      {children}
      <Toast message={message} onDismiss={dismiss} />
    </NotificationIndicatorContext.Provider>
  );
}
